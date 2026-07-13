import { useState, useEffect, useCallback } from "react";
import { readApiFailure, formatApiFailure } from "../lib/apiError";

// Solana Tracker Data API — le plus proche de Birdeye (tri par fenêtre courte
// côté serveur), MAIS nécessite une clé API (header x-api-key).
// Clé à créer sur https://www.solanatracker.io/ puis à mettre dans .env :
//   VITE_SOLANATRACKER_API_KEY = ta_cle
// NOTE: mapping des champs à vérifier contre la doc — non testé sans clé réelle.

interface TrackerToken {
    mint: string;
    symbol: string;
    name: string;
    priceUsd: number;
    marketCap: number;
    liquidity: number;
    createdAt: number; // Unix secondes
}

// Forme tolérante : la réponse trending renvoie un tableau d'objets token/pools.
interface TrackerItem {
    token?: { name?: string; symbol?: string; mint?: string; creation?: { created_time?: number } };
    pools?: {
        price?: { usd?: number };
        marketCap?: { usd?: number };
        liquidity?: { usd?: number };
        createdAt?: number;
    }[];
}

const API_KEY = import.meta.env.VITE_SOLANATRACKER_API_KEY as string | undefined;
const MAX_MARKET_CAP = 2_000_000;
const POLL_INTERVAL_MS = 30_000;

function formatAge(createdAtUnix?: number): string {
    if (!createdAtUnix) return "?";
    const diffSeconds = Date.now() / 1000 - createdAtUnix;
    if (diffSeconds < 60) return `${Math.floor(diffSeconds)}s`;
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}min`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h`;
    return `${Math.floor(diffSeconds / 86400)}j`;
}

export default function SolanaTrackerPage() {
    const [tokens, setTokens] = useState<TrackerToken[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchTokens = useCallback(async () => {
        if (!API_KEY) return; // rien à faire sans clé
        setLoading(true);
        setError(null);
        try {
            const url = "https://data.solanatracker.io/tokens/trending/5m";
            const res = await fetch(url, {
                headers: { accept: "application/json", "x-api-key": API_KEY },
            });

            if (!res.ok) {
                const failure = await readApiFailure("Solana Tracker", res);
                console.error("Echec API Solana Tracker:", failure);
                throw new Error(formatApiFailure(failure));
            }

            const json: TrackerItem[] = await res.json();

            const mapped: TrackerToken[] = json
                .map((item) => {
                    const pool = item.pools?.[0];
                    return {
                        mint: item.token?.mint ?? "",
                        symbol: item.token?.symbol ?? "?",
                        name: item.token?.name ?? "?",
                        priceUsd: pool?.price?.usd ?? 0,
                        marketCap: pool?.marketCap?.usd ?? 0,
                        liquidity: pool?.liquidity?.usd ?? 0,
                        createdAt: item.token?.creation?.created_time ?? pool?.createdAt ?? 0,
                    };
                })
                .filter((t) => t.mint && t.marketCap <= MAX_MARKET_CAP);

            setTokens(mapped);
        } catch (e) {
            console.error("Erreur fetch:", e);
            setError(e instanceof Error ? e.message : "Erreur inconnue");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!API_KEY) return;
        fetchTokens();
        const interval = setInterval(fetchTokens, POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [fetchTokens]);

    if (!API_KEY) {
        return (
            <div style={{ fontFamily: "monospace", padding: "1rem" }}>
                <h1>Solana Tracker</h1>
                <p style={{ color: "#b36b00" }}>
                    ⚠️ Clé API manquante. Cette API nécessite une clé (header <code>x-api-key</code>).
                </p>
                <ol>
                    <li>Crée une clé sur <a href="https://www.solanatracker.io/" target="_blank" rel="noreferrer">solanatracker.io</a></li>
                    <li>Ajoute dans <code>.env</code> : <code>VITE_SOLANATRACKER_API_KEY = ta_cle</code></li>
                    <li>Redémarre le serveur dev (<code>npm run dev</code>)</li>
                </ol>
            </div>
        );
    }

    return (
        <div style={{ fontFamily: "monospace", padding: "1rem" }}>
            <h1>Solana Tracker (clé API)</h1>
            <p>Tendances 5 min | Market Cap ≤ ${MAX_MARKET_CAP.toLocaleString()}</p>
            <button onClick={fetchTokens} disabled={loading}>
                {loading ? "Chargement..." : "Rafraîchir"}
            </button>
            {error && <p style={{ color: "red" }}>Erreur: {error}</p>}

            <table border={1} cellPadding={6} style={{ marginTop: "1rem", width: "100%" }}>
                <thead>
                <tr>
                    <th>Symbol</th>
                    <th>Market Cap ($)</th>
                    <th>Liquidité ($)</th>
                    <th>Prix ($)</th>
                    <th>Âge</th>
                    <th>Lien</th>
                </tr>
                </thead>
                <tbody>
                {tokens.map((t) => (
                    <tr key={t.mint}>
                        <td>{t.symbol}</td>
                        <td>{Math.round(t.marketCap).toLocaleString()}</td>
                        <td>{Math.round(t.liquidity).toLocaleString()}</td>
                        <td>{t.priceUsd}</td>
                        <td>{formatAge(t.createdAt)}</td>
                        <td>
                            <a href={`https://dexscreener.com/solana/${t.mint}`} target="_blank" rel="noreferrer">
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
