import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchTrends, pickTrend, TOKENS_PER_CALL } from "./dexscreenerTrend.ts";
import type { DexPair } from "./dexscreenerTrend.ts";

// Réponse réelle de GET /tokens/v1/solana/<GP,HIGGS,SOL> (2026-10-12), réduite aux champs utilisés :
// une paire par token, celle où il est baseToken (GP/GLDx, HIGGS/SOL, SOL/USDC).
const REAL: DexPair[] = JSON.parse(
    readFileSync(new URL("./fixtures/dexscreener-tokens-gp-higgs-sol.json", import.meta.url), "utf8")
);
const GP = "HTmQz7My6MehV7bjhJ6jde8nDND1yvsz68d24LP7YgUQ";
const HIGGS = "DoVAVzViX8Bjy3r15nwikSaSbzE6dV4ovd28aWpJpump";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function pair(base: string, liquidityUsd: number, priceChange: DexPair["priceChange"]): DexPair {
    return {
        baseToken: { address: base, symbol: base.slice(0, 4) },
        quoteToken: { address: "QUOTE", symbol: "SOL" },
        priceChange,
        liquidity: { usd: liquidityUsd },
    };
}

test("pickTrend lit les variations 1 h / 6 h / 24 h du token sur une réponse réelle", () => {
    assert.deepEqual(pickTrend(REAL, GP), { h1: -1.49, h6: -1.47, h24: -18.09 });
    assert.deepEqual(pickTrend(REAL, HIGGS), { h1: -7.83, h6: -27.42, h24: -41.65 });
});

test("pickTrend ignore une paire où le token n'est que la quote (son prix serait celui de l'autre token)", () => {
    // USDC n'apparaît que comme quote de SOL/USDC dans la réponse.
    assert.equal(pickTrend(REAL, USDC), null);
});

test("pickTrend prend la paire la plus liquide parmi celles où le token est la base", () => {
    const pairs = [pair("TOK", 3_000, { h1: 495_755, h24: -13 }), pair("TOK", 46_000, { h1: -1.5, h6: 4.3, h24: -11.5 })];

    assert.deepEqual(pickTrend(pairs, "TOK"), { h1: -1.5, h6: 4.3, h24: -11.5 });
});

test("pickTrend renvoie null pour une variation absente", () => {
    assert.deepEqual(pickTrend([pair("TOK", 1_000, { h24: 5 })], "TOK"), { h1: null, h6: null, h24: 5 });
});

test("fetchTrends interroge DexScreener par lots de 30 tokens et marque les tokens inconnus", async () => {
    const mints = Array.from({ length: 65 }, (_, i) => `MINT${i}`);
    const urls: string[] = [];
    const fakeFetch = async (url: string | URL | Request) => {
        urls.push(String(url));
        const asked = String(url).split("/").pop()!.split(",");
        const body = asked.filter((m) => m !== "MINT64").map((m) => pair(m, 1_000, { h1: 1, h6: 2, h24: 3 }));
        return new Response(JSON.stringify(body), { status: 200 });
    };

    const trends = await fetchTrends(mints, undefined, fakeFetch);

    assert.equal(urls.length, 3);
    assert.ok(urls.every((u) => u.split("/").pop()!.split(",").length <= TOKENS_PER_CALL));
    assert.deepEqual(trends.get("MINT0"), { h1: 1, h6: 2, h24: 3 });
    assert.equal(trends.get("MINT64"), null);
});

test("fetchTrends lève une erreur lisible quand DexScreener refuse", async () => {
    const fakeFetch = async () => new Response("Too Many Requests", { status: 429 });

    await assert.rejects(fetchTrends(["MINT"], undefined, fakeFetch), /DexScreener.*HTTP 429/);
});
