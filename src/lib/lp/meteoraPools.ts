// Données Meteora DLMM pour l'onglet « Choix LP » (docs/specs/lp-picker/PLAN.md §4) : types de
// l'API, filtres de la liste automatique et regroupement par token. Logique pure, sauf les deux fetch.

import { formatApiFailure, readApiFailure } from "../apiError.ts";

export const METEORA_POOLS_URL = "https://dlmm.datapi.meteora.ag/pools";
export const WSOL_MINT = "So11111111111111111111111111111111111111112";
// 200 pools triés par volume ≈ 70 tokens candidats ; plus de pools = plus de petits tokens mais
// une réponse plus lourde (500 pools ≈ 1 s).
export const AUTO_LIST_PAGE_SIZE = 200;
export const MIN_MARKET_CAP = 100_000;

// « Majors » exclus de la liste automatique : ce ne sont pas des memecoins à LP. Exclusion par mint,
// jamais par symbole (un memecoin peut s'appeler SOLAMA ou USDUC). Les memecoins établis (BONK,
// PENGU, USELESS, ANSEM, CATE…) restent : Vladimir les cite comme candidats Bid-Ask.
// Relevé le 2026-10-07 dans les 500 premiers pools par volume — à valider par Enzo (PLAN.md Q1).
export const MAJOR_MINTS: ReadonlySet<string> = new Set([
    // Stablecoins
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
    "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
    "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB", // USD1
    "2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH", // USDG
    "DEkqHyPN7GMRJ5cArtQFAWefqbZb33Hyf6s5iCwjEonT", // USDe
    "JuprjznTrTSp2UFa3ZBUFgwdAmtZCq4MQCwysN55USD", // JupUSD
    "5YMkXAYccHSGnHn9nob9xEvv6Pvka9DZWH7nTbotTu9E", // hyUSD
    "usdsfJbX78ktZUnoRC7dwvvQz7xH3WdkpGne76gdUia", // USD+
    // SOL liquides (LST)
    "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn", // JitoSOL
    "jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v", // JupSOL
    "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So", // mSOL
    "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1", // bSOL
    "5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm", // INF
    "4sWNB8zGWHkh6UnmwiEtzNxL4XrN7uK9tosbESbJFfVs", // xSOL
    // BTC / ETH / ZEC wrappés
    "cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij", // cbBTC
    "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh", // WBTC
    "zBTCug3er3tLyffELcvDNrKkCymbPWysGcWihESYfLg", // zBTC
    "2zCo6bUowJMvr89ajxuWsPadAqJ2F9akCkxumNsSdgsL", // xBTC
    "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs", // ETH (Wormhole)
    "A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS", // ZEC
    // Actions tokenisées (xStocks)
    "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB", // TSLAx
    "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh", // NVDAx
    "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W", // SPYx
    "Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ", // QQQx
    "XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN", // GOOGLx
    "XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX", // MSFTx
    "Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu", // METAx
    "Xs3oZwbHvqis4NYcf4YKWmEia2eC84wSiVrcYcTqpH8", // SPCXx
    // Tokens de protocole
    "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", // JUP
    "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL", // JTO
    "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R", // RAY
    "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE", // ORCA
    "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4", // JLP
    "METvsvVRapdj9cFLzq4Tr43xK4tAjQfwX76z3n6mWQL", // MET (Meteora)
    "pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn", // PUMP (pump.fun)
    "rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof", // RENDER
    "Grass7B4RdKfBCjTKgSqnXkqjwiGvQyFbuSCUJr3XXjs", // GRASS
    "KMNo3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS", // KMNO
    "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3", // PYTH
]);

export interface PoolToken {
    address: string;
    symbol: string;
    market_cap: number;
}

// Sous-ensemble des champs de GET /pools utilisés par l'onglet.
export interface MeteoraPool {
    address: string;
    name: string;
    token_x: PoolToken;
    token_y: PoolToken;
    pool_config: { bin_step: number; base_fee_pct: number }; // base_fee_pct en pourcent : 0.3 = 0,3 %
    tvl: number;
    volume: { "24h": number };
    fees: { "24h": number };
    is_blacklisted: boolean;
    created_at: number; // millisecondes
}

export interface PoolOfToken {
    pool: MeteoraPool;
    token: PoolToken;
    solPair: boolean;
}

export interface TokenGroup {
    token: PoolToken;
    volume24h: number; // somme des volumes 24 h de ses pools retenus
    fees24h: number; // somme des frais 24 h de ses pools retenus (classement de Tiago, §12)
    pools: MeteoraPool[];
}

// Le token « LP-able » d'une paire SOL (l'autre côté du SOL), ou null si le pool n'est pas appairé à SOL.
export function tokenOf(pool: MeteoraPool): PoolToken | null {
    if (pool.token_y.address === WSOL_MINT) return pool.token_x;
    if (pool.token_x.address === WSOL_MINT) return pool.token_y;
    return null;
}

// RG-05 : paires SOL, hors blacklist, hors majors, market cap ≥ 100k.
export function autoListCandidates(pools: MeteoraPool[]): PoolOfToken[] {
    const out: PoolOfToken[] = [];
    for (const pool of pools) {
        const token = tokenOf(pool);
        if (!token || pool.is_blacklisted) continue;
        if (MAJOR_MINTS.has(token.address) || !(token.market_cap >= MIN_MARKET_CAP)) continue;
        out.push({ pool, token, solPair: true });
    }
    return out;
}

export function groupByToken(candidates: PoolOfToken[]): TokenGroup[] {
    const groups = new Map<string, TokenGroup>();
    for (const { pool, token } of candidates) {
        const group = groups.get(token.address) ?? { token, volume24h: 0, fees24h: 0, pools: [] };
        group.volume24h += pool.volume["24h"] ?? 0;
        group.fees24h += pool.fees["24h"] ?? 0;
        group.pools.push(pool);
        groups.set(token.address, group);
    }
    return [...groups.values()].sort((a, b) => b.volume24h - a.volume24h);
}

// RG-06 : `query` de l'API est une recherche, pas un filtre exact. On ne garde que les pools dont un
// des deux tokens EST le mint saisi ; les paires non-SOL sont conservées mais signalées.
export function poolsForMint(pools: MeteoraPool[], mint: string): PoolOfToken[] {
    const out: PoolOfToken[] = [];
    for (const pool of pools) {
        const token = pool.token_x.address === mint ? pool.token_x : pool.token_y.address === mint ? pool.token_y : null;
        if (!token) continue;
        const other = token === pool.token_x ? pool.token_y : pool.token_x;
        out.push({ pool, token, solPair: other.address === WSOL_MINT });
    }
    return out;
}

async function fetchPools(params: string, signal?: AbortSignal): Promise<MeteoraPool[]> {
    const res = await fetch(`${METEORA_POOLS_URL}?${params}`, { signal, headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(formatApiFailure(await readApiFailure("Meteora", res)));
    const json = (await res.json()) as { data?: MeteoraPool[] };
    return json.data ?? [];
}

export function fetchTopPoolsByVolume(signal?: AbortSignal): Promise<MeteoraPool[]> {
    // `sort_by=volume.24h:desc` renvoie une liste vide : la bonne clé est volume_24h.
    return fetchPools(`page=1&page_size=${AUTO_LIST_PAGE_SIZE}&sort_by=volume_24h:desc`, signal);
}

// Liste de Tiago (§12.2) : la clé de tri est fee_24h (`fees_24h` est refusée par l'API).
export function fetchTopPoolsByFees(signal?: AbortSignal): Promise<MeteoraPool[]> {
    return fetchPools(`page=1&page_size=${AUTO_LIST_PAGE_SIZE}&sort_by=fee_24h:desc`, signal);
}

export function fetchPoolsByQuery(mint: string, signal?: AbortSignal): Promise<MeteoraPool[]> {
    return fetchPools(`page=1&page_size=50&query=${encodeURIComponent(mint)}`, signal);
}
