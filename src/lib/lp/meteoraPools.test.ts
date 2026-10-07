import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { autoListCandidates, groupByToken, MAJOR_MINTS, poolsForMint, tokenOf, WSOL_MINT } from "./meteoraPools.ts";
import type { MeteoraPool, PoolToken } from "./meteoraPools.ts";

const SOL: PoolToken = { address: WSOL_MINT, symbol: "SOL", market_cap: 7e10 };
const USDC: PoolToken = { address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", symbol: "USDC", market_cap: 7.7e9 };

function token(address: string, marketCap = 500_000, symbol = address.slice(0, 4)): PoolToken {
    return { address, symbol, market_cap: marketCap };
}

function pool(x: PoolToken, y: PoolToken, volume24h = 1000, extra: Partial<MeteoraPool> = {}): MeteoraPool {
    return {
        address: `${x.symbol}-${y.symbol}-${volume24h}`,
        name: `${x.symbol}-${y.symbol}`,
        token_x: x,
        token_y: y,
        pool_config: { bin_step: 100, base_fee_pct: 2 },
        tvl: 1,
        volume: { "24h": volume24h },
        fees: { "24h": 1 },
        is_blacklisted: false,
        created_at: 0,
        ...extra,
    };
}

test("tokenOf renvoie le côté non-SOL, que SOL soit token_x ou token_y", () => {
    const meme = token("MEME");
    assert.equal(tokenOf(pool(meme, SOL)), meme);
    assert.equal(tokenOf(pool(SOL, meme)), meme);
    assert.equal(tokenOf(pool(meme, USDC)), null);
});

test("autoListCandidates ne garde que les paires SOL de memecoins ≥ 100k, hors blacklist et majors", () => {
    const meme = token("MEME", 500_000);
    const pools = [
        pool(meme, SOL),
        pool(SOL, meme, 2000),
        pool(meme, USDC), // pas une paire SOL
        pool(token("TINY", 99_999), SOL), // sous 100k
        pool(token("BAD"), SOL, 1000, { is_blacklisted: true }),
        pool(token("JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", 1e9, "JUP"), SOL), // major
        pool(USDC, SOL), // stablecoin
    ];
    assert.deepEqual(autoListCandidates(pools).map((c) => c.pool.name), ["MEME-SOL", "SOL-MEME"]);
});

test("un memecoin dont le symbole contient SOL ou USD n'est pas pris pour un major", () => {
    const pools = [pool(token("SOLAMA", 2e6, "SOLAMA"), SOL), pool(token("USDUC", 3e6, "USDUC"), SOL)];
    assert.equal(autoListCandidates(pools).length, 2);
});

test("MAJOR_MINTS exclut stablecoins, SOL liquides, wrapped, actions et protocoles, pas les memecoins établis", () => {
    for (const mint of [
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
        "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn", // JitoSOL
        "cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij", // cbBTC
        "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB", // TSLAx
        "METvsvVRapdj9cFLzq4Tr43xK4tAjQfwX76z3n6mWQL", // MET
    ]) {
        assert.ok(MAJOR_MINTS.has(mint), mint);
    }
    for (const mint of [
        "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", // BONK
        "Dz9mQ9NzkBcCsuGPFJ3r1bS4wgqKMHBPiVuniW8Mbonk", // USELESS
        "9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump", // ANSEM
    ]) {
        assert.ok(!MAJOR_MINTS.has(mint), mint);
    }
});

test("groupByToken regroupe par token, somme les volumes et trie par volume décroissant", () => {
    const a = token("AAAA");
    const b = token("BBBB");
    const groups = groupByToken(autoListCandidates([pool(a, SOL, 100), pool(b, SOL, 500), pool(SOL, a, 300)]));
    assert.deepEqual(
        groups.map((g) => ({ mint: g.token.address, volume: g.volume24h, pools: g.pools.length })),
        [
            { mint: "BBBB", volume: 500, pools: 1 },
            { mint: "AAAA", volume: 400, pools: 2 },
        ],
    );
});

test("poolsForMint ne garde que les pools du mint exact et signale les paires non-SOL (RG-06)", () => {
    const target = token("TARGET");
    const lookalike = token("TARGET2");
    const found = poolsForMint([pool(target, SOL), pool(target, USDC), pool(lookalike, SOL)], "TARGET");
    assert.deepEqual(
        found.map((f) => ({ name: f.pool.name, solPair: f.solPair })),
        [
            { name: "TARG-SOL", solPair: true },
            { name: "TARG-USDC", solPair: false },
        ],
    );
});

test("données réelles (40 pools du haut du classement) : aucun major ni stablecoin parmi les candidats", () => {
    const raw = JSON.parse(readFileSync(new URL("./fixtures/meteora-top40-by-volume.json", import.meta.url), "utf8")) as MeteoraPool[];
    const candidates = autoListCandidates(raw);
    assert.ok(candidates.length > 0);
    for (const c of candidates) {
        assert.ok(!MAJOR_MINTS.has(c.token.address), c.pool.name);
        assert.ok(c.token.market_cap >= 100_000, c.pool.name);
        assert.ok(c.pool.token_x.address === WSOL_MINT || c.pool.token_y.address === WSOL_MINT, c.pool.name);
    }
});
