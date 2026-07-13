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
        <div style={{ fontFamily: "monospace", padding: "1rem" }}>
            <h1>GeckoTerminal (sans clé API)</h1>
            <p>
                Volume 5min ≥ ${MIN_VOLUME_5M.toLocaleString()} | Market Cap ≤ ${MAX_MARKET_CAP.toLocaleString()} —
                tri 5m côté client
            </p>
            <button onClick={fetchTokens} disabled={loading}>
                {loading ? "Chargement..." : "Rafraîchir"}
            </button>
            {error && <p style={{ color: "red" }}>Erreur: {error}</p>}
            {!error && !loading && tokens.length === 0 && (
                <p style={{ color: "#888" }}>Aucun pool ne passe le filtre volume 5m pour le moment.</p>
            )}

            <table border={1} cellPadding={6} style={{ marginTop: "1rem", width: "100%" }}>
                <thead>
                <tr>
                    <th>Pool</th>
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
                        <td>{t.name}</td>
                        <td>{Math.round(t.volume5m).toLocaleString()}</td>
                        <td>{Math.round(t.marketCap).toLocaleString()}</td>
                        <td>{t.priceUsd}</td>
                        <td>{formatAge(t.createdAt)}</td>
                        <td>
                            <a
                                href={`https://www.geckoterminal.com/solana/pools/${t.address}`}
                                target="_blank"
                                rel="noreferrer"
                            >
                                GeckoTerminal
                            </a>
                        </td>
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
    );
}
