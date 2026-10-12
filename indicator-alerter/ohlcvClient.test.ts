import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { fetchCandles, splitCandles } from "./ohlcvClient.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
    globalThis.fetch = realFetch;
});

function respondWith(status: number, body: unknown): void {
    globalThis.fetch = async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const T0 = 1_791_000_000;
const STEP = 15 * 60;
type Row = [number, number, number, number, number, number];
const row = (ts: number, close: number): Row => [ts, close, close, close, close, 1];

test("splitCandles sépare les bougies fermées (triées) de la bougie en cours", () => {
    // GeckoTerminal renvoie du plus récent au plus ancien.
    const raw = [row(T0 + 2 * STEP, 3), row(T0 + STEP, 2), row(T0, 1)];

    const { closed, current } = splitCandles(raw, T0 + 2 * STEP + 60);

    assert.deepEqual(closed.map((c) => c.ts), [T0, T0 + STEP]);
    assert.equal(current?.ts, T0 + 2 * STEP);
    assert.equal(current?.close, 3);
});

test("splitCandles renvoie current = null quand aucune bougie n'est en cours", () => {
    const raw = [row(T0 + STEP, 2), row(T0, 1)];

    const { closed, current } = splitCandles(raw, T0 + 2 * STEP);

    assert.equal(closed.length, 2);
    assert.equal(current, null);
});

test("fetchCandles renvoie null quand GeckoTerminal ne connaît plus le pool (404)", async () => {
    respondWith(404, { errors: [{ status: "404", title: "Not Found" }] });

    assert.equal(await fetchCandles("POOL", 300), null);
});

test("fetchCandles lève sur un rate limit (429) au lieu de le traiter comme un pool disparu", async () => {
    respondWith(429, { status: { error_code: 429, error_message: "Rate Limited" } });

    await assert.rejects(fetchCandles("POOL", 300), /HTTP 429/);
});
