import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { readApiFailure, formatApiFailure } from "../lib/apiError";

// Scanner de risque token — un CA à la fois, déclenchement manuel (pas de polling).
// Sources gratuites sans clé : RugCheck (risque global, insiders, mint/freeze authority,
// LP lock) et DexScreener orders (dex paid). GMGN, Deepnets.ai et Bubblemaps n'ont pas d'API
// gratuite exploitable pour des données structurées : liens externes (+ iframe pour Bubblemaps).
// Chaque source est isolée : l'échec de l'une n'affecte jamais l'affichage des autres.
// Voir docs/specs/token-scanner/ pour la spec complète.

interface RugcheckRisk {
    name?: string;
    value?: string;
    description?: string;
    score?: number;
    level?: string;
}

interface RugcheckMarket {
    lp?: { lpLockedPct?: number; quoteUSD?: number; baseUSD?: number };
}

interface RugcheckReport {
    score?: number;
    score_normalised?: number;
    risks?: RugcheckRisk[];
    rugged?: boolean;
    // Absent de `/report` en pratique (confirmé par test réel, 2026-07-19) : n'existe que sur
    // `/report/summary`. Gardé ici en repli tolérant si RugCheck l'ajoute un jour à `/report` ;
    // la valeur réellement utilisée vient de `deriveLpLockedPct()` (agrégée depuis `markets[]`,
    // déjà présent dans la même réponse `/report`, donc sans appel supplémentaire).
    lpLockedPct?: number;
    totalLPProviders?: number;
    graphInsidersDetected?: number;
    insiderNetworks?: unknown[];
    token?: { mintAuthority?: string | null; freezeAuthority?: string | null };
    verification?: { jup_verified?: boolean };
    markets?: RugcheckMarket[];
}

// `/report` ne porte pas de `lpLockedPct` racine (seul `/report/summary` l'a) — dérivé ici
// depuis `markets[].lp.lpLockedPct`, pondéré par la liquidité USD de chaque pool, pour ne pas
// perdre ce signal ni faire un appel réseau de plus.
function deriveLpLockedPct(data: RugcheckReport): number | undefined {
    if (data.lpLockedPct !== undefined) return data.lpLockedPct;
    const markets = data.markets ?? [];
    let weightedSum = 0;
    let totalWeight = 0;
    for (const m of markets) {
        const lp = m.lp;
        if (!lp || lp.lpLockedPct === undefined) continue;
        const weight = (lp.quoteUSD ?? 0) + (lp.baseUSD ?? 0);
        if (weight <= 0) continue;
        weightedSum += lp.lpLockedPct * weight;
        totalWeight += weight;
    }
    return totalWeight > 0 ? weightedSum / totalWeight : undefined;
}

interface DexOrder {
    type?: string;
    status?: string;
}

interface DexPaidResult {
    paid: boolean;
    approvedTypes: string[];
}

type BlockState<T> =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "ok"; data: T }
    | { status: "unknown" }
    | { status: "error"; message: string };

// Base58, longueur typique d'une adresse Solana (mint ou wallet).
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

// La longueur de la chaîne base58 seule ne garantit pas 32 octets décodés (pas de
// correspondance fixe caractères→octets) — sans décodage réel, une chaîne du bon
// gabarit mais invalide passe le filtre et RugCheck renvoie une erreur HTTP brute
// à la place du message "adresse invalide" attendu.
function base58ByteLength(ca: string): number | null {
    let bytes: number[] = [0];
    for (const char of ca) {
        const value = BASE58_ALPHABET.indexOf(char);
        if (value === -1) return null;
        let carry = value;
        for (let i = 0; i < bytes.length; i++) {
            carry += bytes[i] * 58;
            bytes[i] = carry & 0xff;
            carry >>= 8;
        }
        while (carry > 0) {
            bytes.push(carry & 0xff);
            carry >>= 8;
        }
    }
    for (const char of ca) {
        if (char !== "1") break;
        bytes.push(0);
    }
    return bytes.length;
}

function isValidSolanaAddress(ca: string): boolean {
    return SOLANA_ADDRESS_RE.test(ca) && base58ByteLength(ca) === 32;
}

function shortAddr(addr: string): string {
    return addr.length <= 14 ? addr : `${addr.slice(0, 6)}…${addr.slice(-6)}`;
}

// Seuils indicatifs pour le code couleur (RG-07) : RugCheck ne documente pas d'échelle
// officielle au-delà de "plus haut = plus risqué", donc ces bornes sont un choix éditorial,
// pas une donnée de la source — appliquées uniquement à score_normalised (échelle ~0-100),
// jamais au score brut dont l'amplitude varie trop d'un token à l'autre.
function scoreLevel(scoreNormalised: number | undefined): "good" | "warn" | "bad" | null {
    if (scoreNormalised === undefined) return null;
    if (scoreNormalised <= 30) return "good";
    if (scoreNormalised <= 60) return "warn";
    return "bad";
}

function levelBadgeClass(level: "good" | "warn" | "bad" | null): string {
    if (level === "good") return "badge badge-good";
    if (level === "warn") return "badge badge-warn";
    if (level === "bad") return "badge badge-bad";
    return "badge";
}

// "warn"/"danger" observés en pratique dans risks[] (cf. spec technique §4.1, Q4) ; repli
// neutre pour toute autre valeur non documentée par RugCheck.
function riskLevelBadgeClass(level?: string): string {
    if (level === "danger") return "badge badge-bad";
    if (level === "warn") return "badge badge-warn";
    return "badge";
}

// Score agrégé maison (Lot 6, Q8) — EXPÉRIMENTAL. RugCheck ne fournit qu'un score global ;
// ceci recombine 4 signaux internes à un même rapport RugCheck (donc jamais "source down",
// seulement "champ absent du rapport") en un seul chiffre pondéré. Dex Paid, Snipers et
// Phishing sont volontairement exclus : le premier est un signal positif faible et non un
// facteur de risque, les deux autres n'ont aucune source fiable (RG-04) — les inclure dans un
// score chiffré leur donnerait une crédibilité qu'ils n'ont pas. Poids arbitraires, non
// backtestés sur des rugs confirmés : à afficher avec la décomposition, jamais seuls.
interface ScoreComponent {
    label: string;
    subscore: number; // 0-100, 0 = sûr, 100 = dangereux
    weight: number;
}

// Plancher appliqué si RugCheck flague un facteur en "danger" dans risks[] (ex. "Low
// Liquidity") : sans lui, un token isolément flaggé dangereux mais favorable sur les 4 autres
// composants (authorities révoquées, LP lockée, peu d'insiders) peut ressortir "vert" — vérifié
// en test réel (2026-07-19) sur un token à $0.35 de liquidité noté 29/100. Seuil éditorial, pas
// une valeur documentée par RugCheck.
const DANGER_RISK_FLOOR = 70;

interface AggregateScore {
    score: number;
    components: ScoreComponent[];
    missing: string[];
    ruggedOverride: boolean;
    dangerFloorApplied: boolean;
}

function computeAggregateScore(data: RugcheckReport): AggregateScore | null {
    const components: ScoreComponent[] = [];
    const missing: string[] = [];

    if (data.score_normalised !== undefined) {
        components.push({ label: "Risque global RugCheck", subscore: data.score_normalised, weight: 0.4 });
    } else {
        missing.push("Risque global RugCheck (score_normalised absent)");
    }

    if (data.token?.mintAuthority !== undefined && data.token?.freezeAuthority !== undefined) {
        const subscore = (data.token.mintAuthority ? 50 : 0) + (data.token.freezeAuthority ? 50 : 0);
        components.push({ label: "Authorities (mint/freeze)", subscore, weight: 0.25 });
    } else {
        missing.push("Authorities (mint/freeze non renseignées par le rapport)");
    }

    const lpLockedPct = deriveLpLockedPct(data);
    if (lpLockedPct !== undefined) {
        components.push({
            label: "LP verrouillée/brûlée",
            subscore: Math.max(0, Math.min(100, 100 - lpLockedPct)),
            weight: 0.2,
        });
    } else {
        missing.push("LP lock (aucune donnée de lock exploitable dans markets[])");
    }

    if (data.graphInsidersDetected !== undefined) {
        components.push({
            label: "Insiders",
            subscore: Math.min(100, data.graphInsidersDetected * 20),
            weight: 0.15,
        });
    } else {
        missing.push("Insiders (graphInsidersDetected absent)");
    }

    if (components.length === 0) return null;

    // Renormalisation : si un signal manque, son poids n'est pas perdu mais redistribué sur
    // les signaux disponibles, plutôt que de fausser silencieusement le score vers "sûr".
    const weightSum = components.reduce((s, c) => s + c.weight, 0);
    const weighted = components.reduce((s, c) => s + (c.subscore * c.weight) / weightSum, 0);

    const ruggedOverride = data.rugged === true;
    const hasDangerRisk = (data.risks ?? []).some((r) => r.level === "danger");
    const dangerFloorApplied = !ruggedOverride && hasDangerRisk && weighted < DANGER_RISK_FLOOR;
    const score = ruggedOverride
        ? 100
        : dangerFloorApplied
          ? DANGER_RISK_FLOOR
          : Math.round(weighted);

    return { score, components, missing, ruggedOverride, dangerFloorApplied };
}

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            type="button"
            className="copy-btn"
            onClick={async () => {
                try {
                    await navigator.clipboard.writeText(text);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                } catch {
                    // Presse-papiers indisponible (contexte non sécurisé, permission refusée…) —
                    // pas de repli utile côté page, l'adresse reste visible et copiable à la main.
                }
            }}
        >
            {copied ? "Copié ✓" : "Copier"}
        </button>
    );
}

// Best-effort seulement : RugCheck n'a pas de catégorie "sniper"/"phishing" dédiée,
// on ne fait que grep les facteurs de risque existants (RG-04 : ne jamais afficher
// "0 sniper" comme un fait vérifié quand la source ne couvre pas la catégorie).
const SNIPER_KEYWORDS = ["snip", "bundl"];
const PHISHING_KEYWORDS = ["phish", "scam", "fraud"];

function matchesKeyword(risk: RugcheckRisk, keywords: string[]): boolean {
    const haystack = `${risk.name ?? ""} ${risk.description ?? ""}`.toLowerCase();
    return keywords.some((k) => haystack.includes(k));
}

function ScanBlock<T>({
    title,
    state,
    render,
}: {
    title: string;
    state: BlockState<T>;
    render: (data: T) => ReactNode;
}) {
    return (
        <div className="scan-block">
            <h3>{title}</h3>
            {state.status === "idle" && <p className="hint">En attente d'une analyse.</p>}
            {state.status === "loading" && <p className="hint">Chargement…</p>}
            {state.status === "unknown" && <p className="hint">Token inconnu de cette source.</p>}
            {state.status === "error" && <div className="alert alert-error">{state.message}</div>}
            {state.status === "ok" && render(state.data)}
        </div>
    );
}

export default function TokenScannerPage() {
    const [caInput, setCaInput] = useState("");
    const [formError, setFormError] = useState<string | null>(null);
    const [analyzedCa, setAnalyzedCa] = useState<string | null>(null);
    const [rugcheck, setRugcheck] = useState<BlockState<RugcheckReport>>({ status: "idle" });
    const [dexPaid, setDexPaid] = useState<BlockState<DexPaidResult>>({ status: "idle" });
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => () => abortRef.current?.abort(), []);

    const runAnalysis = useCallback((ca: string) => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setAnalyzedCa(ca);
        setRugcheck({ status: "loading" });
        setDexPaid({ status: "loading" });

        // RugCheck — un seul appel couvre risque global, insiders et authorities/LP.
        (async () => {
            try {
                const res = await fetch(`https://api.rugcheck.xyz/v1/tokens/${ca}/report`, {
                    headers: { accept: "application/json" },
                    signal: controller.signal,
                });
                if (controller.signal.aborted) return;
                if (res.status === 404) {
                    setRugcheck({ status: "unknown" });
                    return;
                }
                if (!res.ok) {
                    const failure = await readApiFailure("RugCheck", res);
                    console.error("Echec API RugCheck:", failure);
                    setRugcheck({ status: "error", message: formatApiFailure(failure) });
                    return;
                }
                const data = (await res.json()) as RugcheckReport;
                setRugcheck({ status: "ok", data });
            } catch (e) {
                if (controller.signal.aborted) return;
                console.error("Erreur fetch RugCheck:", e);
                setRugcheck({ status: "error", message: e instanceof Error ? e.message : "Erreur inconnue" });
            }
        })();

        // DexScreener orders — dérive uniquement le badge "Dex Paid".
        (async () => {
            try {
                const res = await fetch(`https://api.dexscreener.com/orders/v1/solana/${ca}`, {
                    headers: { accept: "application/json" },
                    signal: controller.signal,
                });
                if (controller.signal.aborted) return;
                if (!res.ok) {
                    const failure = await readApiFailure("DexScreener", res);
                    console.error("Echec API DexScreener orders:", failure);
                    setDexPaid({ status: "error", message: formatApiFailure(failure) });
                    return;
                }
                const data = (await res.json()) as { orders?: DexOrder[] };
                const approved = (data.orders ?? []).filter((o) => o.status === "approved");
                setDexPaid({
                    status: "ok",
                    data: { paid: approved.length > 0, approvedTypes: approved.map((o) => o.type ?? "?") },
                });
            } catch (e) {
                if (controller.signal.aborted) return;
                console.error("Erreur fetch DexScreener orders:", e);
                setDexPaid({ status: "error", message: e instanceof Error ? e.message : "Erreur inconnue" });
            }
        })();
    }, []);

    const handleSubmit = useCallback(
        (e: FormEvent) => {
            e.preventDefault();
            const ca = caInput.trim();
            if (!isValidSolanaAddress(ca)) {
                setFormError("Adresse invalide — une contract address Solana fait 32 à 44 caractères en base58.");
                return;
            }
            setFormError(null);
            runAnalysis(ca);
        },
        [caInput, runAnalysis],
    );

    const loading = rugcheck.status === "loading" || dexPaid.status === "loading";

    return (
        <div className="page">
            <header className="page-header">
                <div>
                    <h1>Scanner de risque <span className="badge">sans clé API</span></h1>
                    <p className="subtitle">
                        Colle une contract address Solana pour un verdict à la demande — RugCheck + DexScreener,
                        liens externes pour GMGN/Deepnets/Bubblemaps.
                    </p>
                </div>
            </header>

            <form className="scan-form" onSubmit={handleSubmit}>
                <input
                    className="scan-input"
                    type="text"
                    placeholder="Contract address Solana (base58)…"
                    value={caInput}
                    onChange={(e) => setCaInput(e.target.value)}
                    spellCheck={false}
                    autoComplete="off"
                />
                <button className="btn" type="submit" disabled={loading}>
                    {loading ? "Analyse…" : "Analyser"}
                </button>
            </form>
            {formError && <div className="alert alert-error">{formError}</div>}

            {analyzedCa && (
                <>
                    <p className="hint-inline">
                        Analyse de <code>{shortAddr(analyzedCa)}</code>
                        <CopyButton text={analyzedCa} />
                    </p>

                    <div className="scan-grid">
                        <ScanBlock
                            title="Risque global"
                            state={rugcheck}
                            render={(data) => {
                                const score = data.score_normalised ?? data.score;
                                const level = data.rugged ? "bad" : scoreLevel(data.score_normalised);
                                return (
                                    <>
                                        <p className="sens-metier">
                                            Note synthétique de dangerosité — plus haut = plus risqué. Premier filtre
                                            « go / méfiance / fuis », pas un audit complet.
                                        </p>
                                        <p>
                                            Score RugCheck :{" "}
                                            <span className={levelBadgeClass(level)}>{score ?? "?"}</span>
                                            {data.rugged && <span className="badge badge-bad">RUGGED</span>}
                                        </p>
                                        {data.verification?.jup_verified && (
                                            <p className="hint-inline">Vérifié par Jupiter (signal positif faible).</p>
                                        )}
                                        {data.risks && data.risks.length > 0 ? (
                                            <ul className="risk-list">
                                                {data.risks.map((r, i) => (
                                                    <li key={i}>
                                                        <strong>{r.name ?? "Facteur de risque"}</strong>
                                                        {r.level && (
                                                            <span className={riskLevelBadgeClass(r.level)}>{r.level}</span>
                                                        )}
                                                        {r.value && <span className="risk-value"> {r.value}</span>}
                                                        {r.description ? <> — {r.description}</> : null}
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <p className="hint-inline">
                                                Aucun facteur de risque signalé par RugCheck — plutôt bon signe, sans
                                                que ce soit une garantie d'absence de risque.
                                            </p>
                                        )}
                                    </>
                                );
                            }}
                        />

                        <ScanBlock
                            title="Score agrégé (maison) ⚠️"
                            state={rugcheck}
                            render={(data) => {
                                const agg = computeAggregateScore(data);
                                if (!agg) {
                                    return (
                                        <p className="hint-inline">
                                            Non calculable — aucun des signaux nécessaires n'est présent dans le
                                            rapport RugCheck.
                                        </p>
                                    );
                                }
                                return (
                                    <>
                                        <p className="sens-metier">
                                            Expérimental — pondération éditoriale non backtestée sur des rugs
                                            confirmés (Q8). Combine 4 signaux du rapport RugCheck ; Dex Paid,
                                            Snipers et Phishing sont volontairement exclus (cf. blocs dédiés). Un
                                            plancher à {DANGER_RISK_FLOOR} s'applique si RugCheck flague un facteur
                                            en "danger" (ex. Low Liquidity), pour ne jamais afficher "vert" un
                                            token que la source elle-même juge dangereux sur un point précis. À
                                            lire en complément du score RugCheck ci-dessus, pas à sa place.
                                        </p>
                                        <p>
                                            Score maison :{" "}
                                            <span className={levelBadgeClass(scoreLevel(agg.score))}>{agg.score}</span>
                                            {agg.ruggedOverride && (
                                                <span className="badge badge-bad">forcé à 100 (rugged)</span>
                                            )}
                                            {agg.dangerFloorApplied && (
                                                <span className="badge badge-warn">
                                                    plancher {DANGER_RISK_FLOOR} (facteur "danger" RugCheck)
                                                </span>
                                            )}
                                        </p>
                                        <ul className="risk-list">
                                            {agg.components.map((c) => (
                                                <li key={c.label}>
                                                    {c.label} :{" "}
                                                    <span className="risk-value">
                                                        {Math.round(c.subscore)}/100 (poids {(c.weight * 100).toFixed(0)}%)
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                        {agg.missing.length > 0 && (
                                            <p className="hint-inline">
                                                Signaux absents, poids redistribué sur le reste : {agg.missing.join(", ")}.
                                            </p>
                                        )}
                                    </>
                                );
                            }}
                        />

                        <ScanBlock
                            title="Insiders"
                            state={rugcheck}
                            render={(data) => {
                                const count = data.graphInsidersDetected ?? 0;
                                const level = data.graphInsidersDetected === undefined ? null : count > 0 ? "warn" : "good";
                                return (
                                    <>
                                        <p className="sens-metier">
                                            Wallets liés au créateur ayant reçu des tokens hors achat normal
                                            (transferts, pré-mine). Concentration forte = risque de rug/dump.
                                        </p>
                                        <p>
                                            Insiders détectés (graphe) :{" "}
                                            <span className={levelBadgeClass(level)}>{data.graphInsidersDetected ?? "?"}</span>
                                        </p>
                                        <p className="hint-inline">
                                            {data.insiderNetworks && data.insiderNetworks.length > 0
                                                ? `${data.insiderNetworks.length} réseau(x) d'insiders détecté(s).`
                                                : "Aucun réseau d'insiders détecté par RugCheck."}
                                        </p>
                                    </>
                                );
                            }}
                        />

                        <ScanBlock
                            title="Burnt / Authorities"
                            state={rugcheck}
                            render={(data) => {
                                const mintRevoked = !data.token?.mintAuthority;
                                const freezeRevoked = !data.token?.freezeAuthority;
                                const lpPct = deriveLpLockedPct(data);
                                const lpLevel = lpPct === undefined ? null : lpPct >= 80 ? "good" : lpPct >= 30 ? "warn" : "bad";
                                return (
                                    <>
                                        <p className="sens-metier">
                                            Mint active = le créateur peut créer des tokens à l'infini (dilution).
                                            Freeze active = il peut geler tes tokens. LP non verrouillée/brûlée = il
                                            peut retirer la liquidité (rug). Révoqué/brûlé = rassurant.
                                        </p>
                                        <ul className="risk-list">
                                            <li>
                                                Mint authority :{" "}
                                                <span className={`badge ${mintRevoked ? "badge-good" : "badge-bad"}`}>
                                                    {mintRevoked ? "révoquée" : "active"}
                                                </span>
                                            </li>
                                            <li>
                                                Freeze authority :{" "}
                                                <span className={`badge ${freezeRevoked ? "badge-good" : "badge-bad"}`}>
                                                    {freezeRevoked ? "révoquée" : "active"}
                                                </span>
                                            </li>
                                            <li>
                                                LP verrouillée/brûlée :{" "}
                                                <span className={levelBadgeClass(lpLevel)}>
                                                    {lpPct !== undefined ? `${lpPct.toFixed(1)}%` : "non disponible"}
                                                </span>{" "}
                                                ({data.totalLPProviders ?? "?"} fournisseur(s) LP)
                                            </li>
                                        </ul>
                                    </>
                                );
                            }}
                        />

                        <ScanBlock
                            title="Snipers / Phishing"
                            state={rugcheck}
                            render={(data) => {
                                const risks = data.risks ?? [];
                                const sniperHits = risks.filter((r) => matchesKeyword(r, SNIPER_KEYWORDS));
                                const phishingHits = risks.filter((r) => matchesKeyword(r, PHISHING_KEYWORDS));
                                return (
                                    <>
                                        <div className="alert alert-warn">
                                            Non couvert par une source gratuite dédiée — voir GMGN / outils externes.
                                            Ce qui suit est un sous-produit best-effort des facteurs RugCheck, pas une
                                            mesure fiable ; l'absence de résultat ne veut pas dire « zéro », juste
                                            « rien détecté par ce repli ».
                                        </div>
                                        <p className="sens-metier">
                                            Snipers : wallets ayant acheté dans les tout premiers blocs — beaucoup de
                                            snipers = distribution artificielle, risque de vente massive précoce.
                                        </p>
                                        {sniperHits.length > 0 && (
                                            <ul className="risk-list">
                                                {sniperHits.map((r, i) => (
                                                    <li key={i}>
                                                        <strong>{r.name ?? "Facteur"}</strong>
                                                        {r.value && <span className="risk-value"> {r.value}</span>}
                                                        {r.description ? <> — {r.description}</> : null}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                        <p className="sens-metier">
                                            Phishing : wallets/labels connus comme frauduleux (arnaques, drainers) —
                                            leur présence parmi les holders est un signal d'alerte fort.
                                        </p>
                                        {phishingHits.length > 0 && (
                                            <ul className="risk-list">
                                                {phishingHits.map((r, i) => (
                                                    <li key={i}>
                                                        <strong>{r.name ?? "Facteur"}</strong>
                                                        {r.value && <span className="risk-value"> {r.value}</span>}
                                                        {r.description ? <> — {r.description}</> : null}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                        <a
                                            className="link-btn"
                                            href={`https://gmgn.ai/sol/token/${analyzedCa}`}
                                            target="_blank"
                                            rel="noreferrer"
                                        >
                                            Voir sur GMGN ↗
                                        </a>
                                    </>
                                );
                            }}
                        />

                        <ScanBlock
                            title="Dex Paid"
                            state={dexPaid}
                            render={(data) => (
                                <>
                                    <p className="sens-metier">
                                        Le token a-t-il payé un profil ou une pub DexScreener ? Signal contextuel
                                        faible d'investissement de l'équipe — pas une garantie de sécurité.
                                    </p>
                                    <p>
                                        <span className={`badge ${data.paid ? "badge-good" : ""}`}>
                                            {data.paid ? "Payé" : "Non payé"}
                                        </span>
                                        {data.paid && data.approvedTypes.length > 0 && (
                                            <span className="hint-inline"> ({data.approvedTypes.join(", ")})</span>
                                        )}
                                    </p>
                                </>
                            )}
                        />

                        <div className="scan-block">
                            <h3>Bubblemap</h3>
                            <p className="sens-metier">
                                Clusters de holders — qui détient quoi et quels wallets sont connectés entre eux. Un
                                gros cluster concentré/connecté = risque de dump coordonné.
                            </p>
                            <p className="hint-inline">
                                Visualisation embarquée (iframe gratuite Bubblemaps, pas de données structurées).
                            </p>
                            <div className="iframe-wrap">
                                <iframe
                                    src={`https://app.bubblemaps.io/sol/token/${analyzedCa}`}
                                    title="Bubblemap"
                                    sandbox="allow-scripts allow-same-origin allow-popups"
                                    loading="lazy"
                                />
                            </div>
                            <a
                                className="link-btn"
                                href={`https://app.bubblemaps.io/sol/token/${analyzedCa}`}
                                target="_blank"
                                rel="noreferrer"
                            >
                                Ouvrir sur Bubblemaps ↗
                            </a>
                        </div>

                        <div className="scan-block">
                            <h3>Liens externes</h3>
                            <div className="link-row">
                                <a className="link-btn" href={`https://gmgn.ai/sol/token/${analyzedCa}`} target="_blank" rel="noreferrer">
                                    GMGN ↗
                                </a>
                                <a className="link-btn" href={`https://deepnets.ai/token/${analyzedCa}`} target="_blank" rel="noreferrer">
                                    Deepnets ↗
                                </a>
                                <a className="link-btn" href={`https://rugcheck.xyz/tokens/${analyzedCa}`} target="_blank" rel="noreferrer">
                                    RugCheck ↗
                                </a>
                                <a className="link-btn" href={`https://dexscreener.com/solana/${analyzedCa}`} target="_blank" rel="noreferrer">
                                    DexScreener ↗
                                </a>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
