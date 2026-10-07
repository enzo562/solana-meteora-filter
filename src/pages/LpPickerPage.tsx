import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { isValidSolanaAddress } from "../lib/solanaAddress";
import { autoListCandidates, fetchPoolsByQuery, fetchTopPoolsByVolume, groupByToken, poolsForMint } from "../lib/lp/meteoraPools";
import type { MeteoraPool, PoolOfToken, PoolToken, TokenGroup } from "../lib/lp/meteoraPools";
import { formatCompact, formatPct } from "../lib/lp/format";
import { DEFAULT_TECHNIQUE_ID, TECHNIQUES, techniqueById } from "../lib/lp/registry";
import type { PoolVerdict, Technique } from "../lib/lp/techniques";
import { bestPool } from "../lib/lp/vladimir";

// Choix du pool Meteora DLMM où fournir de la liquidité, selon une technique choisie dans le
// sélecteur (une technique = une liste). Données : API Meteora, appelée directement depuis la page.
// Spec : docs/specs/lp-picker/PLAN.md.

const REFRESH_MS = 60_000;

const VERDICT_ICON: Record<PoolVerdict["level"], string> = { conforme: "✅", proche: "🟡", "hors-regle": "❌" };

type CaState =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "ok"; token: PoolToken; pools: PoolOfToken[] }
    | { status: "empty" }
    | { status: "error"; message: string };

function shortAddr(addr: string): string {
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function errorMessage(e: unknown): string {
    return e instanceof Error ? e.message : "Erreur inconnue";
}

function VerdictCell({ verdict, note }: { verdict: PoolVerdict; note?: string }) {
    return (
        <td>
            {VERDICT_ICON[verdict.level]} {verdict.level === "conforme" ? "conforme" : verdict.reasons.join(" ; ")}
            {note && <span className="hint-inline"> · {note}</span>}
        </td>
    );
}

function PoolLinks({ pool }: { pool: MeteoraPool }) {
    return (
        <span className="link-row">
            <a className="link-btn" href={`https://app.meteora.ag/dlmm/${pool.address}`} target="_blank" rel="noreferrer">
                Meteora ↗
            </a>
            <a className="link-btn" href={`https://dexscreener.com/solana/${pool.address}`} target="_blank" rel="noreferrer">
                DexScreener ↗
            </a>
        </span>
    );
}

function SecurityLinks({ mint }: { mint: string }) {
    return (
        <span className="link-row">
            <a className="link-btn" href={`https://app.bubblemaps.io/sol/token/${mint}`} target="_blank" rel="noreferrer">
                Bubblemaps ↗
            </a>
            <a className="link-btn" href={`https://deepnets.ai/token/${mint}`} target="_blank" rel="noreferrer">
                Deepnets ↗
            </a>
            <a className="link-btn" href={`https://rugcheck.xyz/tokens/${mint}`} target="_blank" rel="noreferrer">
                RugCheck ↗
            </a>
            <a className="link-btn" href={`/scanner?ca=${mint}`} target="_blank" rel="noreferrer">
                Scanner ↗
            </a>
        </span>
    );
}

// Détail d'une ligne dépliée : tous les pools SOL du token, dans un sous-tableau sur toute la largeur.
function PoolDetails({ pools, token, technique, colSpan }: { pools: MeteoraPool[]; token: PoolToken; technique: Technique; colSpan: number }) {
    return (
        <tr>
            <td colSpan={colSpan}>
                <table className="data-table">
                    <thead>
                    <tr>
                        <th>Pool</th>
                        <th className="num">Bin step</th>
                        <th className="num">Frais</th>
                        <th className="num">TVL</th>
                        <th className="num">Vol 24h</th>
                        <th>Verdict</th>
                        <th>Liens</th>
                    </tr>
                    </thead>
                    <tbody>
                    {pools.map((pool) => (
                        <tr key={pool.address}>
                            <td className="mono">{pool.name}</td>
                            <td className="num">{pool.pool_config.bin_step}</td>
                            <td className="num">{formatPct(pool.pool_config.base_fee_pct)}</td>
                            <td className="num">${formatCompact(pool.tvl)}</td>
                            <td className="num">${formatCompact(pool.volume["24h"])}</td>
                            <VerdictCell verdict={technique.evaluate(pool, token)} />
                            <td>
                                <PoolLinks pool={pool} />
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </td>
        </tr>
    );
}

export default function LpPickerPage() {
    const [techniqueId, setTechniqueId] = useState(DEFAULT_TECHNIQUE_ID);
    const technique = techniqueById(techniqueId);

    // --- Recherche par CA ---
    const [ca, setCa] = useState("");
    const [caState, setCaState] = useState<CaState>({ status: "idle" });
    const caAbort = useRef<AbortController | null>(null);

    async function handleSearch(e: FormEvent) {
        e.preventDefault();
        const mint = ca.trim();
        if (!isValidSolanaAddress(mint)) {
            setCaState({ status: "error", message: "Adresse Solana invalide." });
            return;
        }
        caAbort.current?.abort();
        const controller = new AbortController();
        caAbort.current = controller;
        setCaState({ status: "loading" });
        try {
            const pools = poolsForMint(await fetchPoolsByQuery(mint, controller.signal), mint);
            if (controller.signal.aborted) return;
            setCaState(pools.length === 0 ? { status: "empty" } : { status: "ok", token: pools[0].token, pools });
        } catch (err) {
            if (controller.signal.aborted) return;
            setCaState({ status: "error", message: errorMessage(err) });
        }
    }

    // --- Liste automatique ---
    const [groups, setGroups] = useState<TokenGroup[] | null>(null);
    const [listError, setListError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [updatedAt, setUpdatedAt] = useState<string | null>(null);
    const [showAll, setShowAll] = useState(false);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    const loadList = useCallback(async () => {
        setLoading(true);
        try {
            setGroups(groupByToken(autoListCandidates(await fetchTopPoolsByVolume())));
            setUpdatedAt(new Date().toLocaleTimeString());
            setListError(null);
        } catch (err) {
            setListError(errorMessage(err));
        } finally {
            setLoading(false);
        }
    }, []);

    // Premier chargement dans un rappel (react-hooks/set-state-in-effect), puis toutes les 60 s.
    useEffect(() => {
        const first = setTimeout(loadList, 0);
        const interval = setInterval(loadList, REFRESH_MS);
        return () => {
            clearTimeout(first);
            clearInterval(interval);
        };
    }, [loadList]);

    function toggle(mint: string) {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(mint)) next.delete(mint);
            else next.add(mint);
            return next;
        });
    }

    const rows = (groups ?? []).map((group) => {
        const evaluate = (pool: MeteoraPool) => technique.evaluate(pool, group.token);
        const verdicts = group.pools.map(evaluate);
        return {
            group,
            best: bestPool(group.pools, evaluate),
            conformes: verdicts.filter((v) => v.level === "conforme").length,
            proches: verdicts.filter((v) => v.level === "proche").length,
        };
    });
    const visible = showAll ? rows : rows.filter((r) => r.best !== null);

    return (
        <div className="page">
            <header className="page-header">
                <div>
                    <h1>Choix LP · pools Meteora DLMM</h1>
                    <p className="subtitle">Une technique = une liste. Données Meteora, aucun ordre passé depuis cette page.</p>
                </div>
            </header>

            <div className="scan-form">
                <label className="hint-inline" htmlFor="technique">
                    Technique
                </label>
                <select id="technique" className="scan-input" value={techniqueId} onChange={(e) => setTechniqueId(e.target.value)}>
                    {TECHNIQUES.map((t) => (
                        <option key={t.id} value={t.id}>
                            {t.label}
                        </option>
                    ))}
                </select>
            </div>
            <p className="hint">{technique.reminder}</p>

            <h2>Recherche par CA</h2>
            <form className="scan-form" onSubmit={handleSearch}>
                <input
                    className="scan-input"
                    placeholder="Adresse du token (CA)"
                    value={ca}
                    onChange={(e) => setCa(e.target.value)}
                    spellCheck={false}
                    autoComplete="off"
                />
                <button className="btn" type="submit" disabled={caState.status === "loading"}>
                    {caState.status === "loading" ? "Analyse…" : "Analyser"}
                </button>
            </form>
            {caState.status === "error" && <div className="alert alert-error">{caState.message}</div>}
            {caState.status === "empty" && <div className="alert alert-warn">Aucun pool DLMM Meteora pour ce token.</div>}
            {caState.status === "ok" && (
                <div className="table-wrap">
                    <p className="hint">
                        {caState.token.symbol} · market cap ${formatCompact(caState.token.market_cap)} · {caState.pools.length} pool(s){" "}
                        <SecurityLinks mint={caState.token.address} />
                    </p>
                    <div className="table-scroll">
                        <table className="data-table">
                            <thead>
                            <tr>
                                <th>Paire</th>
                                <th className="num">Bin step</th>
                                <th className="num">Frais</th>
                                <th className="num">TVL</th>
                                <th className="num">Vol 24h</th>
                                <th>Verdict</th>
                                <th>Liens</th>
                            </tr>
                            </thead>
                            <tbody>
                            {caState.pools.map(({ pool, token, solPair }) => (
                                <tr key={pool.address}>
                                    <td className="mono">{pool.name}</td>
                                    <td className="num">{pool.pool_config.bin_step}</td>
                                    <td className="num">{formatPct(pool.pool_config.base_fee_pct)}</td>
                                    <td className="num">${formatCompact(pool.tvl)}</td>
                                    <td className="num">${formatCompact(pool.volume["24h"])}</td>
                                    <VerdictCell verdict={technique.evaluate(pool, token)} note={solPair ? undefined : "paire non-SOL"} />
                                    <td>
                                        <PoolLinks pool={pool} />
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <h2>Liste automatique</h2>
            <div className="header-actions">
                <span className="hint-inline">
                    {groups ? `${visible.length} token(s) affiché(s) sur ${rows.length} candidats` : "Chargement…"}
                    {updatedAt && ` · MàJ ${updatedAt} · auto toutes les ${REFRESH_MS / 1000}s`}
                </span>
                <label className="hint-inline">
                    <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> afficher aussi les
                    tokens sans pool retenu
                </label>
                <button className="btn" onClick={loadList} disabled={loading}>
                    {loading ? "Chargement…" : "Rafraîchir"}
                </button>
            </div>
            {listError && <div className="alert alert-error">Liste indisponible : {listError}</div>}

            <div className="table-wrap">
                <div className="table-scroll">
                    <table className="data-table">
                        <thead>
                        <tr>
                            <th>Token</th>
                            <th className="num">Mcap</th>
                            <th className="num">Vol 24h</th>
                            <th className="num">✅ / 🟡</th>
                            <th>Meilleur pool</th>
                            <th>Sécurité</th>
                        </tr>
                        </thead>
                        <tbody>
                        {visible.map(({ group, best, conformes, proches }) => (
                            <Fragment key={group.token.address}>
                                <tr>
                                    <td className="sym">
                                        <button className="copy-btn" type="button" onClick={() => toggle(group.token.address)}>
                                            {expanded.has(group.token.address) ? "▾" : "▸"}
                                        </button>{" "}
                                        {group.token.symbol} <span className="mono hint-inline">{shortAddr(group.token.address)}</span>
                                    </td>
                                    <td className="num">${formatCompact(group.token.market_cap)}</td>
                                    <td className="num" title="Somme des volumes 24 h de ses pools SOL parmi les pools chargés">
                                        ${formatCompact(group.volume24h)}
                                    </td>
                                    <td className="num">
                                        {conformes} / {proches}
                                    </td>
                                    <td>
                                        {best ? (
                                            <>
                                                {VERDICT_ICON[best.verdict.level]} {best.pool.pool_config.bin_step} / {formatPct(best.pool.pool_config.base_fee_pct)}{" "}
                                                <PoolLinks pool={best.pool} />
                                            </>
                                        ) : (
                                            "—"
                                        )}
                                    </td>
                                    <td>
                                        <SecurityLinks mint={group.token.address} />
                                    </td>
                                </tr>
                                {expanded.has(group.token.address) && (
                                    <PoolDetails pools={group.pools} token={group.token} technique={technique} colSpan={6} />
                                )}
                            </Fragment>
                        ))}
                        {groups && visible.length === 0 && (
                            <tr>
                                <td className="table-empty" colSpan={6}>
                                    Aucun token avec un pool retenu par cette technique pour le moment.
                                </td>
                            </tr>
                        )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
