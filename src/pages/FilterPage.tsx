import { useState, useEffect, useCallback } from "react";
import { readApiFailure, formatApiFailure } from "../lib/apiError";

interface TokenItem {
    address: string;
    symbol: string;
    name: string;
    price: number;
    market_cap: number;
    volume_5m_usd: number;
    recent_listing_time?: number; // timestamp Unix en secondes
}

const API_KEY = import.meta.env.VITE_BIRDEYE_API_KEY;
const MIN_VOLUME_5M = 30_000;
const MAX_MARKET_CAP = 2_000_000;

export default function App() {
    const [tokens, setTokens] = useState<TokenItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    function formatAge(timestamp?: number): string {
        if (!timestamp) return "?";

        const now = Date.now() / 1000; // secondes
        const diffSeconds = now - timestamp;

        if (diffSeconds < 60) return `${Math.floor(diffSeconds)}s`;
        if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}min`;
        if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h`;
        return `${Math.floor(diffSeconds / 86400)}j`;
    }

    const fetchTokens = useCallback(async () => {
        console.log("fetchTokens appelé");
        setLoading(true);
        setError(null);
        try {
            const url = `https://public-api.birdeye.so/defi/v3/token/list?sort_by=volume_5m_usd&sort_type=desc&min_volume_5m_usd=${MIN_VOLUME_5M}&max_market_cap=${MAX_MARKET_CAP}&offset=0&limit=100&ui_amount_mode=scaled`;
            console.log("URL:", url);

            const res = await fetch(url, {
                headers: {
                    "X-API-KEY": API_KEY,
                    "x-chain": "solana",
                    accept: "application/json",
                },
            });

            console.log("Status:", res.status);

            if (!res.ok) {
                const failure = await readApiFailure("Birdeye", res);
                console.error("Echec API Birdeye:", failure);
                throw new Error(formatApiFailure(failure));
            }

            const data = await res.json();
            console.log("Data:", data);
            setTokens(data.data?.items ?? []);
        } catch (e) {
            console.error("Erreur fetch:", e);
            setError(e instanceof Error ? e.message : "Erreur inconnue");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchTokens();
        const interval = setInterval(fetchTokens, 30_000); // refresh auto toutes les 30s
        return () => clearInterval(interval);
    }, [fetchTokens]);

    return (
        <div style={{ fontFamily: "monospace", padding: "1rem" }}>
            <h1>Solana Token Filter</h1>
            <p>
                Volume 5min ≥ ${MIN_VOLUME_5M.toLocaleString()} | Market Cap ≤ ${MAX_MARKET_CAP.toLocaleString()}
            </p>
            <button onClick={fetchTokens} disabled={loading}>
                {loading ? "Chargement..." : "Rafraîchir"}
            </button>
            {error && <p style={{ color: "red" }}>Erreur: {error}</p>}

            <table border={1} cellPadding={6} style={{ marginTop: "1rem", width: "100%" }}>
                <thead>
                <tr>
                    <th>Symbol</th>
                    <th>Volume 5m ($)</th>
                    <th>Market Cap ($)</th>
                    <th>Prix ($)</th>
                    <th>Âge</th>
                    <th>Lien</th>
                </tr>
                </thead>
                <tbody>
                {tokens.map((t) => (
                    <tr key={t.address}>
                        <td>{t.symbol}</td>
                        <td>{t.volume_5m_usd?.toLocaleString()}</td>
                        <td>{t.market_cap?.toLocaleString()}</td>
                        <td>{t.price}</td>
                        <td>{formatAge(t.recent_listing_time)}</td>
                        <td>
                            <a
                                href={`https://dexscreener.com/solana/${t.address}`}
                                target="_blank"
                                rel="noreferrer"
                            >
                                DexScreener
                            </a>
                        </td>
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
    );
}