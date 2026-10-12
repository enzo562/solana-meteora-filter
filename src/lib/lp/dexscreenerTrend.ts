// Tendance de prix d'un token pour la technique « Tiago » (PLAN.md §12, RG-11), depuis DexScreener
// (sans clé, limite ~300 appels/min). Meteora ne fournit aucune variation de prix.
//
// GET /tokens/v1/solana/<mint1,…,mint30> renvoie, par token, une seule paire : celle où il est
// baseToken, à la plus forte liquidité (constaté le 2026-10-12 : USDC → USDC/SOL, pas SOL/USDC).
// pickTrend refait ce choix lui-même par sécurité. Variations en USD (risque R5 du plan).

import { formatApiFailure, readApiFailure } from "../apiError.ts";

export const DEXSCREENER_TOKENS_URL = "https://api.dexscreener.com/tokens/v1/solana";
export const TOKENS_PER_CALL = 30; // maximum accepté par l'endpoint

export interface TokenTrend {
    h1: number | null; // variation de prix en %, null si DexScreener ne la donne pas
    h6: number | null;
    h24: number | null;
}

// Sous-ensemble des champs d'une paire DexScreener utilisés ici.
export interface DexPair {
    baseToken: { address: string; symbol: string };
    quoteToken: { address: string; symbol: string };
    priceChange?: { m5?: number; h1?: number; h6?: number; h24?: number };
    liquidity?: { usd?: number };
}

// Tendance du token `mint` : la paire où il est la base (sinon `priceChange` serait le prix de l'autre
// token), la plus liquide (les petites paires ont des variations aberrantes). null si aucune.
export function pickTrend(pairs: DexPair[], mint: string): TokenTrend | null {
    let best: DexPair | null = null;
    for (const pair of pairs) {
        if (pair.baseToken.address !== mint) continue;
        if (!best || (pair.liquidity?.usd ?? 0) > (best.liquidity?.usd ?? 0)) best = pair;
    }
    if (!best) return null;
    const change = best.priceChange ?? {};
    return { h1: change.h1 ?? null, h6: change.h6 ?? null, h24: change.h24 ?? null };
}

// Tendance de chaque mint (null = inconnu de DexScreener). Lève si un appel échoue : la liste
// l'affiche en bandeau et juge alors tous les pools avec une tendance inconnue.
export async function fetchTrends(
    mints: string[],
    signal?: AbortSignal,
    fetchImpl: typeof fetch = fetch
): Promise<Map<string, TokenTrend | null>> {
    const pairs: DexPair[] = [];
    for (let i = 0; i < mints.length; i += TOKENS_PER_CALL) {
        const batch = mints.slice(i, i + TOKENS_PER_CALL);
        const res = await fetchImpl(`${DEXSCREENER_TOKENS_URL}/${batch.join(",")}`, { signal, headers: { accept: "application/json" } });
        if (!res.ok) throw new Error(formatApiFailure(await readApiFailure("DexScreener", res)));
        pairs.push(...((await res.json()) as DexPair[]));
    }
    return new Map(mints.map((mint) => [mint, pickTrend(pairs, mint)]));
}
