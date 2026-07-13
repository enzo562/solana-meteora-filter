import { useState, useEffect, useCallback } from "react";
import { readApiFailure, formatApiFailure } from "../lib/apiError";

// GeckoTerminal (CoinGecko) — aucune clé API requise, pas de compute units.
// On récupère les pools Solana triés par volume 24h, puis on filtre/trie
// côté client sur le volume 5 min (l'API ne trie pas nativement sur le 5m).

interface GeckoToken {
    address: string;
    name: string;
    symbol: string;
    priceUsd: number;
    marketCap: number;
    volume5m: number;
    createdAt: number; // Unix secondes
}

interface GeckoPoolAttributes {
    address: string;
    name: string;
    base_token_price_usd: string | null;
    market_cap_usd: string | null;
    fdv_usd: string | null;
    pool_created_at: string;
    volume_usd: { m5: string; h1: string; h6: string; h24: string };
}

interface GeckoResponse {
    data: { attributes: GeckoPoolAttributes }[];
}

const MIN_VOLUME_5M = 30_000;
const MAX_MARKET_CAP = 2_000_000;
const POLL_INTERVAL_MS = 30_000;

function formatAge(createdAtUnix: number): string {
    const diffSeconds = Date.now() / 1000 - createdAtUnix;
    if (diffSeconds < 60) return `${Math.floor(diffSeconds)}s`;
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}min`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h`;
    return `${Math.floor(diffSeconds / 86400)}j`;
}

export default function GeckoTerminalPage() {
    const [tokens, setTokens] = useState<GeckoToken[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchTokens = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const url =
                "https://api.geckoterminal.com/api/v2/networks/solana/pools?sort=h24_volume_usd_desc&page=1";
            const res = await fetch(url, { headers: { accept: "application/json" } });

            if (!res.ok) {
                const failure = await readApiFailure("GeckoTerminal", res);
                console.error("Echec API GeckoTerminal:", failure);
                throw new Error(formatApiFailure(failure));
            }

            const json: GeckoResponse = await res.json();

            const mapped: GeckoToken[] = json.data
                .map((p) => {
                    const a = p.attributes;
                    const [tokenName] = a.name.split(" / ");
                    return {
                        address: a.address,
                        name: a.name,
                        symbol: tokenName ?? a.name,
                        priceUsd: Number(a.base_token_price_usd ?? 0),
                        marketCap: Number(a.market_cap_usd ?? a.fdv_usd ?? 0),
                        volume5m: Number(a.volume_usd?.m5 ?? 0),
                        createdAt: Math.floor(new Date(a.pool_created_at).getTime() / 1000),
                    };
                })
                .filter((t) => t.volume5m >= MIN_VOLUME_5M && t.marketCap <= MAX_MARKET_CAP)
                .sort((a, b) => b.volume5m - a.volume5m);

            setTokens(mapped);
        } catch (e) {
            console.error("Erreur fetch:", e);
            setError(e instanceof Error ? e.message : "Erreur inconnue");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchTokens();
        const interval = setInterval(fetchTokens, POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [fetchTokens]);

    return (
        <div className="page">
            <header className="page-header">
                <div>
                    <h1>GeckoTerminal <span className="badge">sans clé API</span></h1>
                    <p className="subtitle">
                        Volume 5min ≥ <code>${MIN_VOLUME_5M.toLocaleString()}</code> · Market Cap ≤{" "}
                        <code>${MAX_MARKET_CAP.toLocaleString()}</code> · tri 5m côté client
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
                            <th>Pool</th>
                            <th className="num">Volume 5m ($)</th>
                            <th className="num">Market Cap ($)</th>
                            <th className="num">Prix ($)</th>
                            <th className="num">Âge</th>
                            <th>Lien</th>
                        </tr>
                        </thead>
                        <tbody>
                        {tokens.map((t) => (
                            <tr key={t.address}>
                                <td className="sym">{t.name}</td>
                                <td className="num">{Math.round(t.volume5m).toLocaleString()}</td>
                                <td className="num">{Math.round(t.marketCap).toLocaleString()}</td>
                                <td className="num">{t.priceUsd}</td>
                                <td className="num"><span className="badge">{formatAge(t.createdAt)}</span></td>
                                <td>
                                    <a
                                        className="link-btn"
                                        href={`https://www.geckoterminal.com/solana/pools/${t.address}`}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        GeckoTerminal ↗
                                    </a>
                                </td>
                            </tr>
                        ))}
                        {!error && !loading && tokens.length === 0 && (
                            <tr><td className="table-empty" colSpan={6}>Aucun pool ne passe le filtre volume 5m pour le moment.</td></tr>
                        )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
