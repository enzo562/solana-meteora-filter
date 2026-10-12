// Liste automatique de la technique « Vladimir » (PLAN.md §3.2) : tokens des paires SOL classés par
// volume 24 h, meilleur pool selon la règle de market cap.

import { Fragment, useState } from "react";
import { autoListCandidates, fetchTopPoolsByVolume, groupByToken } from "../../lib/lp/meteoraPools";
import type { MeteoraPool, TokenGroup } from "../../lib/lp/meteoraPools";
import { formatCompact, formatPct, shortAddr } from "../../lib/lp/format";
import { bestPool, vladimirVerdict } from "../../lib/lp/vladimir";
import { REFRESH_MS, useAutoRefresh, useExpanded, useListMinuteVolumes } from "./hooks";
import { MinuteVolumeCells, PoolDetails, PoolLinks, SecurityLinks, VerdictIcon } from "./shared";
import type { ListProps } from "./types";

const COLUMNS = 7;

async function loadGroups(): Promise<TokenGroup[]> {
    return groupByToken(autoListCandidates(await fetchTopPoolsByVolume()));
}

export default function VladimirList({ volumes }: ListProps) {
    const { data: groups, error, loading, updatedAt, refresh } = useAutoRefresh(loadGroups);
    const [showAll, setShowAll] = useState(false);
    const [expanded, toggle] = useExpanded();

    const rows = (groups ?? []).map((group) => {
        const evaluate = (pool: MeteoraPool) => vladimirVerdict(pool, group.token);
        const verdicts = group.pools.map(evaluate);
        return {
            group,
            best: bestPool(group.pools, evaluate),
            conformes: verdicts.filter((v) => v.level === "conforme").length,
            proches: verdicts.filter((v) => v.level === "proche").length,
        };
    });
    const visible = showAll ? rows : rows.filter((r) => r.best !== null);

    useListMinuteVolumes(
        volumes,
        visible.flatMap((r) => (r.best ? [r.best.pool.address] : [])),
        (groups ?? []).filter((g) => expanded.has(g.token.address)).flatMap((g) => g.pools.map((p) => p.address)),
        updatedAt
    );

    return (
        <>
            <div className="header-actions">
                <span className="hint-inline">
                    {groups ? `${visible.length} token(s) affiché(s) sur ${rows.length} candidats` : "Chargement…"}
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

            <div className="table-wrap">
                <div className="table-scroll">
                    <table className="data-table">
                        <thead>
                        <tr>
                            <th>Token</th>
                            <th className="num">Mcap</th>
                            <th className="num">Vol 24h</th>
                            <th className="num" title="Volume de la dernière minute clôturée du meilleur pool (GeckoTerminal)">Vol 1 min</th>
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
                                                {formatPct(best.pool.pool_config.base_fee_pct)} <PoolLinks pool={best.pool} />
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
                                        verdictOf={(pool) => vladimirVerdict(pool, group.token)}
                                        colSpan={COLUMNS}
                                        volumes={volumes}
                                    />
                                )}
                            </Fragment>
                        ))}
                        {groups && visible.length === 0 && (
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
