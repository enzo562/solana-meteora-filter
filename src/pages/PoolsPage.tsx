import { useState, useEffect, useCallback } from "react";
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
    const [seenAddresses, setSeenAddresses] = useState<Set<string>>(new Set());

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

            setSeenAddresses((prev) => {
                const updated = new Set(prev);
                json.data.forEach((p) => updated.add(p.address));
                return updated;
            });
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
        <div style={{ fontFamily: "monospace", padding: "1rem" }}>
            <h1>Nouvelles Pools Meteora</h1>
            <p>
                Rafraîchissement auto toutes les {POLL_INTERVAL_MS / 1000}s
                {lastUpdate && ` — dernière mise à jour: ${lastUpdate.toLocaleTimeString()}`}
            </p>
            <button onClick={fetchNewPools} disabled={loading}>
                {loading ? "Chargement..." : "Rafraîchir"}
            </button>
            {error && <p style={{ color: "red" }}>Erreur: {error}</p>}

            <table border={1} cellPadding={6} style={{ marginTop: "1rem", width: "100%" }}>
                <thead>
                <tr>
                    <th>Nom</th>
                    <th>Adresse</th>
                    <th>Bin Step</th>
                    <th>Frais (%)</th>
                    <th>Liquidité</th>
                    <th>Âge</th>
                    <th>Lien</th>
                </tr>
                </thead>
                <tbody>
                {pools.map((p) => (
                    <tr key={p.address}>
                        <td>{p.name}</td>
                        <td>{p.address.slice(0, 8)}...</td>
                        <td>{p.pool_config.bin_step}</td>
                        <td>{p.pool_config.base_fee_pct}%</td>
                        <td>${p.tvl.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                        <td>{formatAge(p.created_at)}</td>
                        <td>
                            <a href={`https://app.meteora.ag/dlmm/${p.address}`} target="_blank" rel="noreferrer">
                                Meteora
                            </a>
                        </td>
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
    );
}