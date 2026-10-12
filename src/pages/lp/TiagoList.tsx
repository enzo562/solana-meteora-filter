// Liste automatique de la technique « Tiago » (PLAN.md §12.2) : pools aux plus gros frais 24 h,
// tokens classés par frais, tendance de prix DexScreener. Si DexScreener échoue, la liste reste
// affichée avec des tendances inconnues (RG-11).

import { Fragment, useState } from "react";
import { autoListCandidates, fetchTopPoolsByFees, groupByToken } from "../../lib/lp/meteoraPools";
import type { TokenGroup } from "../../lib/lp/meteoraPools";
import { fetchTrends } from "../../lib/lp/dexscreenerTrend";
import type { TokenTrend } from "../../lib/lp/dexscreenerTrend";
import { formatChange, formatCompact, formatPct, shortAddr } from "../../lib/lp/format";
import { evaluateTiago, tiagoRows } from "../../lib/lp/tiago";
import { errorMessage, REFRESH_MS, useAutoRefresh, useExpanded, useListMinuteVolumes } from "./hooks";
import { MinuteVolumeCells, PoolDetails, PoolLinks, SecurityLinks, VerdictIcon } from "./shared";
import type { ListProps } from "./types";

const COLUMNS = 8;

// R5 : DexScreener donne des variations en USD, pas face au SOL.
const TREND_TITLE =
    "Variation du prix en USD (DexScreener) — une baisse du SOL peut faire paraître baissier un token stable face au SOL";

interface TiagoData {
    groups: TokenGroup[];
    trends: Map<string, TokenTrend | null> | null;
    trendError: string | null;
}

async function loadTiago(): Promise<TiagoData> {
    const groups = groupByToken(autoListCandidates(await fetchTopPoolsByFees()));
    try {
        return { groups, trends: await fetchTrends(groups.map((g) => g.token.address)), trendError: null };
    } catch (err) {
        return { groups, trends: null, trendError: errorMessage(err) };
    }
}

function change(value: number | null): string {
    return value === null ? "—" : formatChange(value);
}

export default function TiagoList({ volumes }: ListProps) {
    const { data, error, loading, updatedAt, refresh } = useAutoRefresh(loadTiago);
    const [showAll, setShowAll] = useState(false);
    const [expanded, toggle] = useExpanded();

    const rows = data ? tiagoRows(data.groups, data.trends) : [];
    const visible = showAll ? rows : rows.filter((r) => r.best !== null);

    useListMinuteVolumes(
        volumes,
        visible.flatMap((r) => (r.best ? [r.best.pool.address] : [])),
        rows.filter((r) => expanded.has(r.group.token.address)).flatMap((r) => r.group.pools.map((p) => p.address)),
        updatedAt
    );

    return (
        <>
            <div className="header-actions">
                <span className="hint-inline">
                    {data ? `${visible.length} token(s) affiché(s) sur ${rows.length} candidats` : "Chargement…"}
                    {updatedAt && ` · MàJ ${updatedAt} · auto toutes les ${REFRESH_MS / 1000}s`}
                </span>
                <label className="hint-inline">
                    <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> afficher aussi les
                    tokens sans pool retenu
                </label>
                <button className="btn" onClick={refresh} disabled={loading}>
                    {loading ? "Chargement…" : "Rafraîchir"}
                </button>
            </div>
            {error && <div className="alert alert-error">Liste indisponible : {error}</div>}
            {data?.trendError && (
                <div className="alert alert-warn">Tendance indisponible : {data.trendError} — verdicts « tendance inconnue ».</div>
            )}

            <div className="table-wrap">
                <div className="table-scroll">
                    <table className="data-table">
                        <thead>
                        <tr>
                            <th>Token</th>
                            <th className="num">Mcap</th>
                            <th className="num" title="Somme des frais 24 h de ses pools SOL parmi les pools chargés">Frais 24h</th>
                            <th className="num" title={TREND_TITLE}>1 h / 24 h</th>
                            <th className="num" title="Volume de la dernière minute clôturée du meilleur pool (GeckoTerminal)">Vol 1 min</th>
                            <th className="num">✅ / 🟡</th>
                            <th>Meilleur pool</th>
                            <th>Sécurité</th>
                        </tr>
                        </thead>
                        <tbody>
                        {visible.map(({ group, trend, best, conformes, proches }) => (
                            <Fragment key={group.token.address}>
                                <tr>
                                    <td className="sym">
                                        <button className="copy-btn" type="button" onClick={() => toggle(group.token.address)}>
                                            {expanded.has(group.token.address) ? "▾" : "▸"}
                                        </button>{" "}
                                        {group.token.symbol} <span className="mono hint-inline">{shortAddr(group.token.address)}</span>
                                    </td>
                                    <td className="num">${formatCompact(group.token.market_cap)}</td>
                                    <td className="num">${formatCompact(group.fees24h)}</td>
                                    <td className="num" title={TREND_TITLE}>
                                        {trend ? `${change(trend.h1)} / ${change(trend.h24)}` : "—"}
                                    </td>
                                    {best ? (
                                        <MinuteVolumeCells state={volumes.get(best.pool.address)} withFiveMinutes={false} />
                                    ) : (
                                        <td className="num">—</td>
                                    )}
                                    <td className="num">
                                        {conformes} / {proches}
                                    </td>
                                    <td>
                                        {best ? (
                                            <>
                                                <VerdictIcon level={best.verdict.level} /> {best.pool.pool_config.bin_step} /{" "}
                                                {formatPct(best.pool.pool_config.base_fee_pct)} · ${formatCompact(best.pool.fees["24h"])}{" "}
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
                                    <PoolDetails
                                        pools={group.pools}
                                        verdictOf={(pool) => evaluateTiago(pool, trend)}
                                        colSpan={COLUMNS}
                                        volumes={volumes}
                                    />
                                )}
                            </Fragment>
                        ))}
                        {data && visible.length === 0 && (
                            <tr>
                                <td className="table-empty" colSpan={COLUMNS}>
                                    Aucun token avec un pool retenu par cette technique pour le moment.
                                </td>
                            </tr>
                        )}
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );
}
