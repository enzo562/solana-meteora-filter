// Briques d'affichage communes aux techniques de l'onglet « Choix LP » (PLAN.md §5). Elles ne
// portent aucune règle : le verdict de chaque pool est fourni par la technique (`verdictOf`).

import type { MeteoraPool, PoolOfToken } from "../../lib/lp/meteoraPools";
import { formatCompact, formatPct } from "../../lib/lp/format";
import type { PoolVerdict, VerdictLevel } from "../../lib/lp/techniques";
import type { MinuteVolumeQueue, MinuteVolumeState } from "../../lib/lp/minuteVolume";

const VERDICT_ICON: Record<VerdictLevel, string> = { conforme: "✅", proche: "🟡", "hors-regle": "❌" };

export function VerdictIcon({ level }: { level: VerdictLevel }) {
    return <>{VERDICT_ICON[level]}</>;
}

// `verdict` null = pas encore calculable (donnée de la technique en cours de chargement).
export function VerdictCell({ verdict, note }: { verdict: PoolVerdict | null; note?: string }) {
    if (!verdict) {
        return (
            <td className="hint-inline" title="En cours de chargement">
                …{note && <span> · {note}</span>}
            </td>
        );
    }
    return (
        <td>
            {VERDICT_ICON[verdict.level]} {verdict.level === "conforme" ? "conforme" : verdict.reasons.join(" ; ")}
            {note && <span className="hint-inline"> · {note}</span>}
        </td>
    );
}

// Volume 1 min (et 5 min) d'un pool, servi par la file GeckoTerminal (PLAN.md §11).
export function MinuteVolumeCells({ state, withFiveMinutes }: { state: MinuteVolumeState | undefined; withFiveMinutes: boolean }) {
    if (!state || state.status === "pending") {
        return (
            <>
                <td className="num hint-inline" title="En file d'attente GeckoTerminal">…</td>
                {withFiveMinutes && <td className="num hint-inline">…</td>}
            </>
        );
    }
    if (state.status === "unavailable") {
        return (
            <>
                <td className="num" title={state.reason}>—</td>
                {withFiveMinutes && <td className="num" title={state.reason}>—</td>}
            </>
        );
    }
    const minute = new Date(state.value.candleTs * 1000).toISOString().slice(11, 16);
    const title = `Minute ${minute} UTC · 5 min : $${formatCompact(state.value.last5Minutes)}`;
    return (
        <>
            <td className="num" title={title}>${formatCompact(state.value.lastMinute)}</td>
            {withFiveMinutes && <td className="num" title={title}>${formatCompact(state.value.last5Minutes)}</td>}
        </>
    );
}

export function PoolLinks({ pool }: { pool: MeteoraPool }) {
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

export function SecurityLinks({ mint }: { mint: string }) {
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

function PoolHeaderCells({ first }: { first: string }) {
    return (
        <tr>
            <th>{first}</th>
            <th className="num">Bin step</th>
            <th className="num">Frais</th>
            <th className="num">TVL</th>
            <th className="num">Vol 24h</th>
            <th className="num">Frais 24h</th>
            <th className="num">1 min</th>
            <th className="num">5 min</th>
            <th>Verdict</th>
            <th>Liens</th>
        </tr>
    );
}

function PoolRow({ pool, verdict, note, volumes }: {
    pool: MeteoraPool;
    verdict: PoolVerdict | null;
    note?: string;
    volumes: MinuteVolumeQueue;
}) {
    return (
        <tr>
            <td className="mono">{pool.name}</td>
            <td className="num">{pool.pool_config.bin_step}</td>
            <td className="num">{formatPct(pool.pool_config.base_fee_pct)}</td>
            <td className="num">${formatCompact(pool.tvl)}</td>
            <td className="num">${formatCompact(pool.volume["24h"])}</td>
            <td className="num">${formatCompact(pool.fees["24h"])}</td>
            <MinuteVolumeCells state={volumes.get(pool.address)} withFiveMinutes />
            <VerdictCell verdict={verdict} note={note} />
            <td>
                <PoolLinks pool={pool} />
            </td>
        </tr>
    );
}

// Détail d'une ligne dépliée : tous les pools SOL du token, dans un sous-tableau sur toute la largeur.
export function PoolDetails({ pools, verdictOf, colSpan, volumes }: {
    pools: MeteoraPool[];
    verdictOf: (pool: MeteoraPool) => PoolVerdict | null;
    colSpan: number;
    volumes: MinuteVolumeQueue;
}) {
    return (
        <tr>
            <td colSpan={colSpan}>
                <table className="data-table">
                    <thead>
                    <PoolHeaderCells first="Pool" />
                    </thead>
                    <tbody>
                    {pools.map((pool) => (
                        <PoolRow key={pool.address} pool={pool} verdict={verdictOf(pool)} volumes={volumes} />
                    ))}
                    </tbody>
                </table>
            </td>
        </tr>
    );
}

// Tous les pools d'un CA recherché (RG-06), paires non-SOL signalées.
export function CaPoolsTable({ pools, verdictOf, volumes }: {
    pools: PoolOfToken[];
    verdictOf: (entry: PoolOfToken) => PoolVerdict | null;
    volumes: MinuteVolumeQueue;
}) {
    return (
        <div className="table-scroll">
            <table className="data-table">
                <thead>
                <PoolHeaderCells first="Paire" />
                </thead>
                <tbody>
                {pools.map((entry) => (
                    <PoolRow
                        key={entry.pool.address}
                        pool={entry.pool}
                        verdict={verdictOf(entry)}
                        note={entry.solPair ? undefined : "paire non-SOL"}
                        volumes={volumes}
                    />
                ))}
                </tbody>
            </table>
        </div>
    );
}
