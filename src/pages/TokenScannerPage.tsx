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

interface RugcheckReport {
    score?: number;
    score_normalised?: number;
    risks?: RugcheckRisk[];
    rugged?: boolean;
    lpLockedPct?: number;
    totalLPProviders?: number;
    graphInsidersDetected?: number;
    insiderNetworks?: unknown[];
    token?: { mintAuthority?: string | null; freezeAuthority?: string | null };
    verification?: { jup_verified?: boolean };
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
                    </p>

                    <div className="scan-grid">
                        <ScanBlock
                            title="Risque global"
                            state={rugcheck}
                            render={(data) => {
                                const score = data.score_normalised ?? data.score;
                                return (
                                    <>
                                        <p>
                                            Score RugCheck : <span className="badge">{score ?? "?"}</span>
                                            {data.rugged && <span className="badge badge-bad">RUGGED</span>}
                                        </p>
                                        <p className="hint-inline">Plus haut = plus risqué.</p>
                                        {data.verification?.jup_verified && (
                                            <p className="hint-inline">Vérifié par Jupiter (signal positif faible).</p>
                                        )}
                                        {data.risks && data.risks.length > 0 ? (
                                            <ul className="risk-list">
                                                {data.risks.map((r, i) => (
                                                    <li key={i}>
                                                        <strong>{r.name ?? "Facteur de risque"}</strong>
                                                        {r.level ? ` (${r.level})` : ""}
                                                        {r.description ? ` — ${r.description}` : ""}
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <p className="hint-inline">Aucun facteur de risque signalé par RugCheck.</p>
                                        )}
                                    </>
                                );
                            }}
                        />

                        <ScanBlock
                            title="Insiders"
                            state={rugcheck}
                            render={(data) => (
                                <>
                                    <p>
                                        Insiders détectés (graphe) :{" "}
                                        <span className="badge">{data.graphInsidersDetected ?? "?"}</span>
                                    </p>
                                    <p className="hint-inline">
                                        {data.insiderNetworks && data.insiderNetworks.length > 0
                                            ? `${data.insiderNetworks.length} réseau(x) d'insiders détecté(s).`
                                            : "Aucun réseau d'insiders détecté par RugCheck."}
                                    </p>
                                </>
                            )}
                        />

                        <ScanBlock
                            title="Burnt / Authorities"
                            state={rugcheck}
                            render={(data) => {
                                const mintRevoked = !data.token?.mintAuthority;
                                const freezeRevoked = !data.token?.freezeAuthority;
                                return (
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
                                            <span className="badge">
                                                {data.lpLockedPct !== undefined ? `${data.lpLockedPct}%` : "?"}
                                            </span>{" "}
                                            ({data.totalLPProviders ?? "?"} fournisseur(s) LP)
                                        </li>
                                    </ul>
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
                                            Non couvert par une source gratuite dédiée — ce qui suit est un
                                            sous-produit best-effort des facteurs RugCheck, pas une mesure fiable.
                                        </div>
                                        {(sniperHits.length > 0 || phishingHits.length > 0) && (
                                            <ul className="risk-list">
                                                {[...sniperHits, ...phishingHits].map((r, i) => (
                                                    <li key={i}>
                                                        <strong>{r.name ?? "Facteur"}</strong>
                                                        {r.description ? ` — ${r.description}` : ""}
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
                                <p>
                                    <span className="badge">{data.paid ? "Payé" : "Non payé"}</span>
                                    {data.paid && data.approvedTypes.length > 0 && (
                                        <span className="hint-inline"> ({data.approvedTypes.join(", ")})</span>
                                    )}
                                </p>
                            )}
                        />

                        <div className="scan-block">
                            <h3>Bubblemap</h3>
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
