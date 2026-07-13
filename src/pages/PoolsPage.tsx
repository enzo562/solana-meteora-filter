import { useState, useEffect, useCallback, useRef } from "react";
import { readApiFailure, formatApiFailure } from "../lib/apiError";

interface TokenMetrics {
    address: string;
    name: string;
    symbol: string;
    decimals: number;
    is_verified: boolean;
    holders: number;
    freeze_authority_disabled: boolean;
    total_supply: number;
    price: number;
    market_cap: number;
}

interface TimeWindowData {
    "30m": number;
    "1h": number;
    "2h": number;
    "4h": number;
    "12h": number;
    "24h": number;
}

interface PoolConfig {
    bin_step: number;
    base_fee_pct: number;
    max_fee_pct: number;
    protocol_fee_pct: number;
    collect_fee_mode: number;
}

interface MeteoraPool {
    address: string;
    name: string;
    token_x: TokenMetrics;
    token_y: TokenMetrics;
    created_at: number; // Unix timestamp (millisecondes)
    tvl: number;
    current_price: number;
    apr: number;
    apy: number;
    dynamic_fee_pct: number;
    pool_config: PoolConfig;
    volume: TimeWindowData;
    fees: TimeWindowData;
    is_blacklisted: boolean;
    tags: string[];
}

interface PoolsResponse {
    total: number;
    pages: number;
    current_page: number;
    page_size: number;
    data: MeteoraPool[];
}

const POLL_INTERVAL_MS = 15_000;

function formatAge(createdAtMs: number): string {
    const diffSeconds = (Date.now() - createdAtMs) / 1000;

    if (diffSeconds < 60) return `${Math.floor(diffSeconds)}s`;
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}min`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h`;
    return `${Math.floor(diffSeconds / 86400)}j`;
}

export default function PoolsPage() {
    const [pools, setPools] = useState<MeteoraPool[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
    const [newAddresses, setNewAddresses] = useState<Set<string>>(new Set());
    // Persistant entre fetchs, sans déclencher de rendu : sert à repérer les pools inédites.
    const seenAddresses = useRef<Set<string>>(new Set());

    const fetchNewPools = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const url = "https://dlmm.datapi.meteora.ag/pools?page=1&page_size=50&sort_by=pool_created_at:desc";

            const res = await fetch(url, { headers: { accept: "application/json" } });

            if (!res.ok) {
                const failure = await readApiFailure("Meteora", res);
                console.error("Echec API Meteora:", failure);
                throw new Error(formatApiFailure(failure));
            }

            const json: PoolsResponse = await res.json();
            setPools(json.data);
            setLastUpdate(new Date());

            // Au premier chargement, tout est "déjà vu" : on ne signale rien.
            // Ensuite, une pool absente du set est nouvelle depuis la dernière MàJ.
            const seen = seenAddresses.current;
            const isFirstLoad = seen.size === 0;
            const fresh = new Set<string>();
            if (!isFirstLoad) {
                json.data.forEach((p) => {
                    if (!seen.has(p.address)) fresh.add(p.address);
                });
            }
            json.data.forEach((p) => seen.add(p.address));
            setNewAddresses(fresh);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Erreur inconnue");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchNewPools();
        const interval = setInterval(fetchNewPools, POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [fetchNewPools]);

    return (
        <div className="page">
            <header className="page-header">
                <div>
                    <h1>Nouvelles Pools Meteora</h1>
                    <p className="subtitle">
                        Rafraîchissement auto toutes les {POLL_INTERVAL_MS / 1000}s
                        {lastUpdate && ` · dernière MàJ ${lastUpdate.toLocaleTimeString()}`}
                    </p>
                </div>
                <div className="header-actions">
                    <span className="status"><span className="pulse" />Auto · {POLL_INTERVAL_MS / 1000}s</span>
                    <button className="btn" onClick={fetchNewPools} disabled={loading}>
                        {loading ? "Chargement…" : "Rafraîchir"}
                    </button>
                </div>
            </header>

            {error && <div className="alert alert-error">Erreur : {error}</div>}

            <div className="table-wrap">
                <div className="table-scroll">
                    <table className="data-table">
                        <thead>
                        <tr>
                            <th>Nom</th>
                            <th>Adresse</th>
                            <th className="num">Bin Step</th>
                            <th className="num">Frais</th>
                            <th className="num">Liquidité</th>
                            <th className="num">Âge</th>
                            <th>Lien</th>
                        </tr>
                        </thead>
                        <tbody>
                        {pools.map((p) => (
                            <tr key={p.address} className={newAddresses.has(p.address) ? "row-new" : undefined}>
                                <td className="sym">
                                    {p.name}
                                    {newAddresses.has(p.address) && <span className="badge badge-new">NEW</span>}
                                </td>
                                <td className="mono">{p.address.slice(0, 8)}…</td>
                                <td className="num">{p.pool_config.bin_step}</td>
                                <td className="num">{p.pool_config.base_fee_pct}%</td>
                                <td className="num">${p.tvl.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                <td className="num"><span className="badge">{formatAge(p.created_at)}</span></td>
                                <td>
                                    <a className="link-btn" href={`https://app.meteora.ag/dlmm/${p.address}`} target="_blank" rel="noreferrer">
                                        Meteora ↗
                                    </a>
                                </td>
                            </tr>
                        ))}
                        {!loading && pools.length === 0 && (
                            <tr><td className="table-empty" colSpan={7}>Aucune pool pour le moment.</td></tr>
                        )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}