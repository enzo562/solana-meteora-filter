import { useState, useEffect, useCallback } from "react";
import { readApiFailure, formatApiFailure } from "../lib/apiError";

// DexScreener — aucune clé API requise. Pas d'endpoint "liste globale triée",
// on interroge la recherche puis on filtre/trie côté client sur le volume 5 min.

interface DexToken {
    pairAddress: string;
    symbol: string;
    name: string;
    priceUsd: number;
    marketCap: number;
    volume5m: number;
    liquidity: number;
    createdAt: number; // Unix secondes
}

interface DexPair {
    chainId: string;
    pairAddress: string;
    baseToken: { address: string; name: string; symbol: string };
    priceUsd?: string;
    marketCap?: number;
    fdv?: number;
    volume?: { m5?: number; h1?: number; h6?: number; h24?: number };
    liquidity?: { usd?: number };
    pairCreatedAt?: number; // Unix millisecondes
}

interface DexResponse {
    pairs: DexPair[] | null;
}

const MIN_VOLUME_5M = 30_000;
const MAX_MARKET_CAP = 2_000_000;
const POLL_INTERVAL_MS = 30_000;
// DexScreener n'expose pas de flux global : on agrège plusieurs recherches.
const SEARCH_QUERIES = ["SOL/USDC", "SOL/SOL", "USDC/SOL"];

function formatAge(createdAtUnix: number): string {
    if (!createdAtUnix) return "?";
    const diffSeconds = Date.now() / 1000 - createdAtUnix;
    if (diffSeconds < 60) return `${Math.floor(diffSeconds)}s`;
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}min`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h`;
    return `${Math.floor(diffSeconds / 86400)}j`;
}

export default function DexScreenerPage() {
    const [tokens, setTokens] = useState<DexToken[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchTokens = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const responses = await Promise.all(
                SEARCH_QUERIES.map(async (q) => {
                    const url = `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`;
                    const res = await fetch(url, { headers: { accept: "application/json" } });
                    if (!res.ok) {
                        const failure = await readApiFailure("DexScreener", res);
                        console.error("Echec API DexScreener:", failure);
                        throw new Error(formatApiFailure(failure));
                    }
                    return (await res.json()) as DexResponse;
                }),
            );

            const seen = new Set<string>();
            const mapped: DexToken[] = responses
                .flatMap((r) => r.pairs ?? [])
                .filter((p) => p.chainId === "solana")
                .map((p) => ({
                    pairAddress: p.pairAddress,
                    symbol: p.baseToken.symbol,
                    name: p.baseToken.name,
                    priceUsd: Number(p.priceUsd ?? 0),
                    marketCap: p.marketCap ?? p.fdv ?? 0,
                    volume5m: p.volume?.m5 ?? 0,
                    liquidity: p.liquidity?.usd ?? 0,
                    createdAt: p.pairCreatedAt ? Math.floor(p.pairCreatedAt / 1000) : 0,
                }))
                .filter((t) => {
                    if (seen.has(t.pairAddress)) return false;
                    seen.add(t.pairAddress);
                    return t.volume5m >= MIN_VOLUME_5M && t.marketCap <= MAX_MARKET_CAP;
                })
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
            <h1>DexScreener (sans clé API)</h1>
            <p>
                Volume 5min ≥ ${MIN_VOLUME_5M.toLocaleString()} | Market Cap ≤ ${MAX_MARKET_CAP.toLocaleString()} —
                agrégé sur recherches, filtré côté client
            </p>
            <button onClick={fetchTokens} disabled={loading}>
                {loading ? "Chargement..." : "Rafraîchir"}
            </button>
            {error && <p style={{ color: "red" }}>Erreur: {error}</p>}
            {!error && !loading && tokens.length === 0 && (
                <p style={{ color: "#888" }}>Aucune paire ne passe le filtre volume 5m pour le moment.</p>
            )}

            <table border={1} cellPadding={6} style={{ marginTop: "1rem", width: "100%" }}>
                <thead>
                <tr>
                    <th>Symbol</th>
                    <th>Volume 5m ($)</th>
                    <th>Market Cap ($)</th>
                    <th>Liquidité ($)</th>
                    <th>Prix ($)</th>
                    <th>Âge</th>
                    <th>Lien</th>
                </tr>
                </thead>
                <tbody>
                {tokens.map((t) => (
                    <tr key={t.pairAddress}>
                        <td>{t.symbol}</td>
                        <td>{Math.round(t.volume5m).toLocaleString()}</td>
                        <td>{Math.round(t.marketCap).toLocaleString()}</td>
                        <td>{Math.round(t.liquidity).toLocaleString()}</td>
                        <td>{t.priceUsd}</td>
                        <td>{formatAge(t.createdAt)}</td>
                        <td>
                            <a
                                href={`https://dexscreener.com/solana/${t.pairAddress}`}
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
