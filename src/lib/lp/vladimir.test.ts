import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bestPool, evaluateVladimir, vladimirTechnique } from "./vladimir.ts";
import { poolsForMint, WSOL_MINT } from "./meteoraPools.ts";
import type { MeteoraPool } from "./meteoraPools.ts";

const TOKEN = "TokenMint1111111111111111111111111111111111";

function pool(marketCap: number, baseFeePct: number, binStep: number, volume24h = 1000): MeteoraPool {
    return {
        address: `pool-${baseFeePct}-${binStep}-${volume24h}`,
        name: "TOK-SOL",
        token_x: { address: TOKEN, symbol: "TOK", market_cap: marketCap },
        token_y: { address: WSOL_MINT, symbol: "SOL", market_cap: 7e10 },
        pool_config: { bin_step: binStep, base_fee_pct: baseFeePct },
        tvl: 10_000,
        volume: { "24h": volume24h },
        fees: { "24h": 10 },
        is_blacklisted: false,
        created_at: 0,
    };
}

const level = (mc: number, fee: number, bin: number) => evaluateVladimir(pool(mc, fee, bin), mc).level;

test("règle < 1M : frais ≥ 2 % et bin step 125–200 = conforme", () => {
    assert.equal(level(500_000, 2, 125), "conforme");
    assert.equal(level(500_000, 10, 200), "conforme");
});

test("règle < 1M : tolérance de 20 % = proche (frais ≥ 1,6 %, bin step 100–240)", () => {
    assert.equal(level(500_000, 1.6, 150), "proche");
    assert.equal(level(500_000, 2, 100), "proche");
    assert.equal(level(500_000, 3, 240), "proche");
    assert.equal(level(500_000, 1.59, 150), "hors-regle");
    assert.equal(level(500_000, 2, 99), "hors-regle");
    assert.equal(level(500_000, 2, 241), "hors-regle");
});

test("règle ≥ 1M : frais 0,2–1 % et bin step 20–50 = conforme", () => {
    assert.equal(level(5_000_000, 0.2, 20), "conforme");
    assert.equal(level(5_000_000, 1, 50), "conforme");
});

test("règle ≥ 1M : tolérance de 20 % = proche (frais 0,16–1,2 %, bin step 16–60)", () => {
    assert.equal(level(5_000_000, 0.16, 30), "proche");
    assert.equal(level(5_000_000, 1.2, 30), "proche");
    assert.equal(level(5_000_000, 0.5, 16), "proche");
    assert.equal(level(5_000_000, 0.5, 60), "proche");
    assert.equal(level(5_000_000, 0.15, 30), "hors-regle");
    assert.equal(level(5_000_000, 1.21, 30), "hors-regle");
    assert.equal(level(5_000_000, 0.5, 80), "hors-regle");
});

test("une market cap pile à 1M suit la règle ≥ 1M", () => {
    assert.equal(level(1_000_000, 0.5, 30), "conforme");
});

test("entre 0,8M et 1,2M, les deux règles sont acceptées et la meilleure l'emporte", () => {
    // 900k : un pool « gros token » (0,5 %, bin step 30) est accepté grâce à la frontière.
    assert.equal(level(900_000, 0.5, 30), "conforme");
    // 1,1M : un pool « petit token » (2 %, bin step 150) est accepté aussi.
    assert.equal(level(1_100_000, 2, 150), "conforme");
    // Hors frontière, seule la règle de la tranche s'applique.
    assert.equal(level(1_300_000, 2, 150), "hors-regle");
    assert.equal(level(700_000, 0.5, 30), "hors-regle");
});

test("les raisons expliquent chaque critère non conforme, avec la règle appliquée", () => {
    assert.deepEqual(evaluateVladimir(pool(5_000_000, 0.5, 100), 5_000_000).reasons, ["bin step 100 hors de 20–50 (règle ≥ 1M)"]);
    assert.deepEqual(evaluateVladimir(pool(500_000, 1.8, 150), 500_000).reasons, ["frais 1,8 % proche du minimum 2 % (règle < 1M)"]);
    assert.deepEqual(evaluateVladimir(pool(500_000, 2, 150), 500_000).reasons, []);
});

test("une market cap inconnue donne hors-règle avec sa raison", () => {
    const verdict = evaluateVladimir(pool(0, 2, 150), 0);
    assert.equal(verdict.level, "hors-regle");
    assert.deepEqual(verdict.reasons, ["market cap inconnue"]);
});

test("bestPool prend le conforme au plus fort volume, sinon le proche au plus fort volume", () => {
    const a = pool(500_000, 2, 150, 100); // conforme
    const b = pool(500_000, 2, 150, 900); // conforme, plus de volume
    const c = pool(500_000, 1.8, 150, 5000); // proche, encore plus de volume
    const d = pool(500_000, 0.3, 10, 9000); // hors règle
    const evaluate = (p: MeteoraPool) => evaluateVladimir(p, p.token_x.market_cap);
    assert.equal(bestPool([a, b, c, d], evaluate)?.pool, b);
    assert.equal(bestPool([c, d], evaluate)?.pool, c);
    assert.equal(bestPool([d], evaluate), null);
});

test("la technique évalue la market cap du token recherché, même s'il est en second dans la paire", () => {
    const usdc = { address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", symbol: "USDC", market_cap: 7.7e9 };
    const tok = { address: TOKEN, symbol: "TOK", market_cap: 500_000 };
    const usdcFirst: MeteoraPool = { ...pool(500_000, 2, 150), name: "USDC-TOK", token_x: usdc, token_y: tok };
    // Règle < 1M attendue (TOK à 500k) : 2 % / bin step 150 est conforme. Avec la market cap d'USDC,
    // ce serait la règle ≥ 1M et donc hors règle.
    assert.equal(vladimirTechnique.evaluate(usdcFirst, tok).level, "conforme");
});

test("données réelles HIGGS (1,31M) : pools SOL hors règle, pool USDC 50 / 0,5 % conforme", () => {
    const raw = JSON.parse(readFileSync(new URL("./fixtures/meteora-query-higgs.json", import.meta.url), "utf8")) as MeteoraPool[];
    const higgs = poolsForMint(raw, "DoVAVzViX8Bjy3r15nwikSaSbzE6dV4ovd28aWpJpump");
    const verdicts = higgs.map((h) => ({ name: h.pool.name, solPair: h.solPair, cfg: `${h.pool.pool_config.bin_step}/${h.pool.pool_config.base_fee_pct}`, level: vladimirTechnique.evaluate(h.pool, h.token).level }));

    assert.ok(verdicts.filter((v) => v.solPair).every((v) => v.level === "hors-regle"), JSON.stringify(verdicts));
    assert.deepEqual(verdicts.filter((v) => v.level !== "hors-regle"), [{ name: "HIGGS-USDC", solPair: false, cfg: "50/0.5", level: "conforme" }]);
});
