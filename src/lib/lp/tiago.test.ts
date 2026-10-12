import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateTiago, tiagoRows } from "./tiago.ts";
import type { MeteoraPool, PoolToken, TokenGroup } from "./meteoraPools.ts";
import type { TokenTrend } from "./dexscreenerTrend.ts";

const SOL: PoolToken = { address: "So11111111111111111111111111111111111111112", symbol: "SOL", market_cap: 7e10 };
const UP: TokenTrend = { h1: 2, h6: 5, h24: 12 };

function pool(fees24h: number, name = `P${fees24h}`, token: PoolToken = { address: "TOK", symbol: "TOK", market_cap: 500_000 }): MeteoraPool {
    return {
        address: name,
        name,
        token_x: token,
        token_y: SOL,
        pool_config: { bin_step: 100, base_fee_pct: 2 },
        tvl: 10_000,
        volume: { "24h": fees24h * 50 },
        fees: { "24h": fees24h },
        is_blacklisted: false,
        created_at: 0,
    };
}

test("evaluateTiago : pool conforme avec ≥ 1 000 $ de frais et une tendance 24 h et 1 h positive", () => {
    assert.deepEqual(evaluateTiago(pool(1_000), UP), { level: "conforme", reasons: [] });
});

test("evaluateTiago : plancher de frais 24 h, tolérance de 20 % (800 $)", () => {
    assert.equal(evaluateTiago(pool(999), UP).level, "proche");
    assert.equal(evaluateTiago(pool(800), UP).level, "proche");
    assert.equal(evaluateTiago(pool(799), UP).level, "hors-regle");
    assert.deepEqual(evaluateTiago(pool(650), UP).reasons, ["frais 24 h $650 sous le plancher $1k"]);
    assert.deepEqual(evaluateTiago(pool(900), UP).reasons, ["frais 24 h $900, proche du plancher $1k"]);
});

test("evaluateTiago : petit retracement 1 h jusqu'à −10 % = proche, au-delà = hors règle", () => {
    assert.equal(evaluateTiago(pool(5_000), { h1: 0, h6: 1, h24: 12 }).level, "proche");
    const pullback = evaluateTiago(pool(5_000), { h1: -10, h6: 1, h24: 12 });
    assert.deepEqual(pullback, { level: "proche", reasons: ["petit retracement 1 h : -10 %"] });
    assert.deepEqual(evaluateTiago(pool(5_000), { h1: -10.5, h6: 1, h24: 12 }), {
        level: "hors-regle",
        reasons: ["chute 1 h : -10,5 %"],
    });
});

test("evaluateTiago : 24 h nul ou négatif = hors règle, même si le 1 h remonte", () => {
    assert.equal(evaluateTiago(pool(5_000), { h1: 3, h6: 1, h24: 0 }).level, "hors-regle");
    assert.deepEqual(evaluateTiago(pool(5_000), { h1: 3, h6: 1, h24: -18.09 }).reasons, ["24 h en baisse : -18,1 %"]);
});

test("evaluateTiago : tendance inconnue = proche, jamais conforme (RG-11)", () => {
    assert.deepEqual(evaluateTiago(pool(5_000), null), { level: "proche", reasons: ["tendance inconnue (DexScreener)"] });
    assert.deepEqual(evaluateTiago(pool(5_000), { h1: null, h6: null, h24: null }).reasons, ["tendance inconnue (DexScreener)"]);
    assert.deepEqual(evaluateTiago(pool(5_000), { h1: null, h6: 2, h24: 8 }), { level: "proche", reasons: ["variation 1 h inconnue"] });
});

test("evaluateTiago : le pire des deux critères l'emporte, avec les deux raisons", () => {
    assert.deepEqual(evaluateTiago(pool(900), { h1: 1, h6: 1, h24: -5 }), {
        level: "hors-regle",
        reasons: ["frais 24 h $900, proche du plancher $1k", "24 h en baisse : -5 %"],
    });
});

function group(symbol: string, pools: MeteoraPool[]): TokenGroup {
    const token = pools[0].token_x;
    return {
        token: { ...token, symbol },
        volume24h: pools.reduce((s, p) => s + p.volume["24h"], 0),
        fees24h: pools.reduce((s, p) => s + p.fees["24h"], 0),
        pools,
    };
}

test("tiagoRows trie par frais 24 h du token et choisit le pool aux plus gros frais parmi les meilleurs verdicts", () => {
    const a = { address: "A", symbol: "A", market_cap: 1e6 };
    const b = { address: "B", symbol: "B", market_cap: 1e6 };
    const groups = [
        group("A", [pool(1_200, "A1", a), pool(3_000, "A2", a), pool(900, "A3", a)]),
        group("B", [pool(20_000, "B1", b)]),
    ];

    const rows = tiagoRows(groups, new Map([["A", UP], ["B", UP]]));

    assert.deepEqual(rows.map((r) => r.group.token.address), ["B", "A"]);
    assert.equal(rows[1].best?.pool.name, "A2");
    assert.equal(rows[1].conformes, 2);
    assert.equal(rows[1].proches, 1);
});

test("tiagoRows : sans tendance (DexScreener indisponible), tous les pools sont au mieux proches", () => {
    const rows = tiagoRows([group("TOK", [pool(5_000)])], null);

    assert.equal(rows[0].trend, null);
    assert.equal(rows[0].best?.verdict.level, "proche");
});
