import { test } from "node:test";
import assert from "node:assert/strict";
import { formatChange, formatCompact, formatPct, shortAddr } from "./format.ts";

test("formatCompact abrège les montants en k / M / Md avec une virgule décimale", () => {
    assert.equal(formatCompact(950), "950");
    assert.equal(formatCompact(317_412), "317k");
    assert.equal(formatCompact(2_291_709), "2,3M");
    assert.equal(formatCompact(220_600_000), "220,6M");
    assert.equal(formatCompact(2_870_200_000), "2,9 Md");
    assert.equal(formatCompact(0), "0");
});

test("formatPct affiche un pourcentage Meteora (0.3 = 0,3 %)", () => {
    assert.equal(formatPct(0.3), "0,3 %");
    assert.equal(formatPct(5), "5 %");
    assert.equal(formatPct(0.04), "0,04 %");
});

test("shortAddr garde les 6 premiers et les 4 derniers caractères d'une adresse", () => {
    assert.equal(shortAddr("DoVAVzViX8Bjy3r15nwikSaSbzE6dV4ovd28aWpJpump"), "DoVAVz…pump");
});

test("formatChange affiche une variation de prix signée, à une décimale", () => {
    assert.equal(formatChange(4.12), "+4,1 %");
    assert.equal(formatChange(-18.09), "-18,1 %");
    assert.equal(formatChange(-10), "-10 %");
    assert.equal(formatChange(0), "0 %");
});
