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
            <div className="page">
                <header className="page-header">
                    <div>
                        <h1>Solana Tracker</h1>
                        <p className="subtitle">Cette API nécessite une clé (header <code>x-api-key</code>).</p>
                    </div>
                </header>
                <div className="alert alert-warn">⚠️ Clé API manquante.</div>
                <ol className="hint" style={{ textAlign: "left", maxWidth: 560 }}>
                    <li>Crée une clé sur <a href="https://www.solanatracker.io/" target="_blank" rel="noreferrer">solanatracker.io</a></li>
                    <li>Ajoute dans <code>.env</code> : <code>VITE_SOLANATRACKER_API_KEY = ta_cle</code></li>
                    <li>Redémarre le serveur dev (<code>npm run dev</code>)</li>
                </ol>
            </div>
        );
    }

    return (
        <div className="page">
            <header className="page-header">
                <div>
                    <h1>Solana Tracker <span className="badge">clé API</span></h1>
                    <p className="subtitle">
                        Tendances 5 min · Market Cap ≤ <code>${MAX_MARKET_CAP.toLocaleString()}</code>
                    </p>
                </div>
                <div className="header-actions">
                    <span className="status"><span className="pulse" />Auto · {POLL_INTERVAL_MS / 1000}s</span>
                    <button className="btn" onClick={fetchTokens} disabled={loading}>
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
                            <th>Symbol</th>
                            <th className="num">Market Cap ($)</th>
                            <th className="num">Liquidité ($)</th>
                            <th className="num">Prix ($)</th>
                            <th className="num">Âge</th>
                            <th>Lien</th>
                        </tr>
                        </thead>
                        <tbody>
                        {tokens.map((t) => (
                            <tr key={t.mint}>
                                <td className="sym">{t.symbol}</td>
                                <td className="num">{Math.round(t.marketCap).toLocaleString()}</td>
                                <td className="num">{Math.round(t.liquidity).toLocaleString()}</td>
                                <td className="num">{t.priceUsd}</td>
                                <td className="num"><span className="badge">{formatAge(t.createdAt)}</span></td>
                                <td>
                                    <a className="link-btn" href={`https://dexscreener.com/solana/${t.mint}`} target="_blank" rel="noreferrer">
                                        DexScreener ↗
                                    </a>
                                </td>
                            </tr>
                        ))}
                        {!loading && tokens.length === 0 && (
                            <tr><td className="table-empty" colSpan={6}>Aucun token pour le moment.</td></tr>
                        )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
