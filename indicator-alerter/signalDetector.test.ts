import { test } from "node:test";
import assert from "node:assert/strict";
import { planCycle } from "./signalDetector.ts";
import type { Candle } from "./types.ts";

// Séries synthétiques : une baisse qui s'accélère (MACD rouge, RSI bas, close sous la bande
// haute) suivie d'un saut de +50 % qui déclenche les 3 signaux sur la même bougie.
const T0 = 1_791_000_000;
const STEP = 15 * 60;

function series(closes: number[]): Candle[] {
    return closes.map((close, i) => ({ ts: T0 + i * STEP, open: close, high: close, low: close, close, volume: 1 }));
}

function decline(closes: number[], n: number): void {
    const start = closes.at(-1) ?? 100;
    for (let i = 0; i < n; i++) closes.push(start - 0.01 * i * i);
}

function jump(closes: number[]): void {
    closes.push(closes.at(-1)! * 1.5);
}

function dip(closes: number[]): void {
    closes.push(closes.at(-1)! * 0.99);
}

// 60 bougies de baisse puis, à l'indice 60, une bougie qualifiante (3/3).
function withJumpAt60(): Candle[] {
    const closes: number[] = [];
    decline(closes, 60);
    jump(closes);
    return series(closes);
}

test("planCycle alerte sur la bougie en cours dès que la combo y apparaît", () => {
    const all = withJumpAt60();
    const closed = all.slice(0, 60);
    const current = all[60];

    const plan = planCycle({ closed, current }, { lastProcessedCandleTs: closed[59].ts, lastAlertedCandleTs: null });

    assert.equal(plan.bootstrap, false);
    assert.equal(plan.alert?.candle.ts, current.ts);
    assert.equal(plan.alert?.inProgress, true);
    assert.equal(plan.lastAlertedCandleTs, current.ts);
    assert.equal(plan.lastProcessedCandleTs, closed[59].ts, "seules les bougies fermées font avancer lastProcessedCandleTs");
});

test("planCycle n'alerte pas une 2e fois quand la bougie déjà alertée en cours se clôture", () => {
    const closes: number[] = [];
    decline(closes, 60);
    jump(closes);
    dip(closes);
    const all = series(closes);
    const closed = all.slice(0, 61);
    const current = all[61];

    const plan = planCycle({ closed, current }, { lastProcessedCandleTs: all[59].ts, lastAlertedCandleTs: all[60].ts });

    assert.equal(plan.alert, null);
    assert.equal(plan.lastProcessedCandleTs, all[60].ts);
    assert.equal(plan.lastAlertedCandleTs, all[60].ts);
});

test("planCycle alerte à la clôture quand la combo n'a jamais été vue en cours de bougie", () => {
    const closes: number[] = [];
    decline(closes, 60);
    jump(closes);
    dip(closes);
    const all = series(closes);
    const closed = all.slice(0, 61);
    const current = all[61];

    const plan = planCycle({ closed, current }, { lastProcessedCandleTs: all[59].ts, lastAlertedCandleTs: null });

    assert.equal(plan.alert?.candle.ts, all[60].ts);
    assert.equal(plan.alert?.inProgress, false);
    assert.equal(plan.lastAlertedCandleTs, all[60].ts);
});

test("planCycle reste silencieux au bootstrap même si la combo est déjà vraie sur la bougie en cours", () => {
    const all = withJumpAt60();
    const closed = all.slice(0, 60);
    const current = all[60];

    const plan = planCycle({ closed, current }, { lastProcessedCandleTs: null, lastAlertedCandleTs: null });

    assert.equal(plan.bootstrap, true);
    assert.equal(plan.alert, null);
    assert.equal(plan.lastProcessedCandleTs, closed[59].ts);
    assert.equal(plan.lastAlertedCandleTs, current.ts, "la condition pré-existante est marquée comme déjà vue");
});

test("planCycle laisse la bougie en cours alertable au bootstrap quand la combo n'y est pas encore", () => {
    const closes: number[] = [];
    decline(closes, 60);
    dip(closes);
    const all = series(closes);

    const plan = planCycle({ closed: all.slice(0, 60), current: all[60] }, { lastProcessedCandleTs: null, lastAlertedCandleTs: null });

    assert.equal(plan.bootstrap, true);
    assert.equal(plan.alert, null);
    assert.equal(plan.lastAlertedCandleTs, null);
});

test("planCycle n'alerte qu'une fois, sur la plus récente bougie qualifiante, après une interruption", () => {
    const closes: number[] = [];
    decline(closes, 60);
    jump(closes); // indice 60
    decline(closes, 40);
    jump(closes); // indice 101
    const all = series(closes);

    const plan = planCycle({ closed: all, current: null }, { lastProcessedCandleTs: all[59].ts, lastAlertedCandleTs: null });

    assert.equal(plan.alert?.candle.ts, all[101].ts);
    assert.equal(plan.alert?.inProgress, false);
    assert.equal(plan.lastProcessedCandleTs, all[101].ts);
});
