import { test } from "node:test";
import assert from "node:assert/strict";
import { createMinuteVolumeQueue, parseMinuteVolume } from "./minuteVolume.ts";

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 7, 20, 30, 20); // 20:30:20 UTC : la bougie 20:30 est encore ouverte

// Bougie GeckoTerminal : [ts ouverture (s), open, high, low, close, volume]
const candle = (minute: number, volume: number) => [Date.UTC(2026, 9, 7, 20, minute) / 1000, 1, 1, 1, 1, volume];

test("parseMinuteVolume écarte la minute en cours et garde la dernière minute clôturée", () => {
    const list = [candle(30, 999), candle(29, 1049), candle(28, 78), candle(27, 10), candle(26, 20), candle(25, 30), candle(24, 40)];
    assert.deepEqual(parseMinuteVolume(list, T0), {
        lastMinute: 1049,
        last5Minutes: 1049 + 78 + 10 + 20 + 30,
        candleTs: Date.UTC(2026, 9, 7, 20, 29) / 1000,
    });
});

test("parseMinuteVolume renvoie null s'il n'y a aucune minute clôturée", () => {
    assert.equal(parseMinuteVolume([candle(30, 5)], T0), null);
    assert.equal(parseMinuteVolume([], T0), null);
});

// --- File d'attente : horloge et fetch simulés ---

function fakeClock(start = T0) {
    let now = start;
    let timers: { at: number; fn: () => void }[] = [];
    const flush = () => new Promise((r) => setImmediate(r));
    return {
        now: () => now,
        setTimer: (fn: () => void, ms: number) => {
            const handle = { at: now + ms, fn };
            timers.push(handle);
            return handle;
        },
        clearTimer: (handle: unknown) => {
            timers = timers.filter((t) => t !== handle);
        },
        async advance(ms: number) {
            const end = now + ms;
            for (;;) {
                await flush();
                timers.sort((a, b) => a.at - b.at);
                const next = timers[0];
                if (!next || next.at > end) break;
                timers.shift();
                now = next.at;
                next.fn();
            }
            now = end;
            await flush();
            await flush();
        },
    };
}

function okResponse() {
    const body = { data: { attributes: { ohlcv_list: [candle(30, 1), candle(29, 100), candle(28, 50)] } } };
    return new Response(JSON.stringify(body), { status: 200 });
}

function setup(responses: Record<string, () => Response> = {}) {
    const clock = fakeClock();
    const calls: { pool: string; at: number }[] = [];
    const queue = createMinuteVolumeQueue({
        fetchPool: async (pool) => {
            calls.push({ pool, at: clock.now() - T0 });
            return (responses[pool] ?? okResponse)();
        },
        now: clock.now,
        setTimer: clock.setTimer,
        clearTimer: clock.clearTimer,
    });
    return { clock, calls, queue };
}

test("la file espace les appels de 2,5 s", async () => {
    const { clock, calls, queue } = setup();
    queue.request("A", 2);
    queue.request("B", 2);
    queue.request("C", 2);
    await clock.advance(10_000);
    assert.deepEqual(calls, [
        { pool: "A", at: 0 },
        { pool: "B", at: 2500 },
        { pool: "C", at: 5000 },
    ]);
    assert.deepEqual(queue.get("B"), { status: "ok", value: { lastMinute: 100, last5Minutes: 150, candleTs: candle(29, 0)[0] }, fetchedAt: T0 + 2500 });
});

test("la recherche par CA (priorité 0) passe avant la liste (priorité 2)", async () => {
    const { clock, calls, queue } = setup();
    queue.request("liste-1", 2);
    queue.request("liste-2", 2);
    queue.request("ca", 0);
    await clock.advance(10_000);
    assert.deepEqual(calls.map((c) => c.pool), ["ca", "liste-1", "liste-2"]);
});

test("une CA demandée pendant le remplissage de la liste passe devant les pools encore en attente", async () => {
    const { clock, calls, queue } = setup();
    queue.request("liste-1", 2);
    queue.request("liste-2", 2);
    queue.request("liste-3", 2);
    await clock.advance(1000); // liste-1 déjà appelé
    queue.request("ca", 0);
    await clock.advance(10_000);
    assert.deepEqual(calls.map((c) => c.pool), ["liste-1", "ca", "liste-2", "liste-3"]);
});

test("une demande en double ou récente (< 60 s) ne relance pas d'appel ; au-delà, si", async () => {
    const { clock, calls, queue } = setup();
    queue.request("A", 2);
    queue.request("A", 1);
    await clock.advance(3000);
    queue.request("A", 2);
    await clock.advance(30_000);
    assert.equal(calls.length, 1);
    await clock.advance(MIN);
    queue.request("A", 2);
    await clock.advance(3000);
    assert.equal(calls.length, 2);
});

test("un 429 met la file en pause 30 s puis réessaie le pool", async () => {
    let first = true;
    const { clock, calls, queue } = setup({
        A: () => {
            if (first) {
                first = false;
                return new Response("too many", { status: 429 });
            }
            return okResponse();
        },
    });
    queue.request("A", 2);
    queue.request("B", 2);
    await clock.advance(1000);
    const limited = queue.get("A");
    assert.equal(limited?.status, "unavailable");
    assert.match(limited?.status === "unavailable" ? limited.reason : "", /limite/i);

    await clock.advance(25_000);
    assert.equal(calls.length, 1, "aucun appel pendant la pause");

    await clock.advance(10_000);
    assert.deepEqual(calls.map((c) => c.pool), ["A", "B", "A"].slice(0, calls.length));
    assert.ok(calls.length >= 2 && calls[1].at >= 30_000, JSON.stringify(calls));
    await clock.advance(10_000);
    assert.equal(queue.get("A")?.status, "ok");
});

test("une erreur réseau (le 429 de GeckoTerminal sans en-tête CORS, vu du navigateur) met aussi la file en pause", async () => {
    const clock = fakeClock();
    const calls: number[] = [];
    let fail = true;
    const queue = createMinuteVolumeQueue({
        fetchPool: async () => {
            calls.push(clock.now() - T0);
            if (fail) throw new TypeError("Failed to fetch");
            return okResponse();
        },
        now: clock.now,
        setTimer: clock.setTimer,
        clearTimer: clock.clearTimer,
    });
    queue.request("A", 2);
    queue.request("B", 2);
    await clock.advance(1000);
    const state = queue.get("A");
    assert.equal(state?.status, "unavailable");
    assert.match(state?.status === "unavailable" ? state.reason : "", /limite|injoignable/i);

    await clock.advance(25_000);
    assert.deepEqual(calls, [0], "aucun appel pendant la pause");

    fail = false;
    await clock.advance(10_000);
    assert.ok(calls.length >= 2 && calls[1] >= 30_000, JSON.stringify(calls));
    await clock.advance(5_000);
    assert.equal(queue.get("A")?.status, "ok", "A est réessayé après la pause");
});

test("une autre erreur HTTP donne « indisponible » avec le code, sans bloquer la file", async () => {
    const { clock, calls, queue } = setup({ A: () => new Response("nope", { status: 404 }) });
    queue.request("A", 2);
    queue.request("B", 2);
    await clock.advance(5000);
    assert.deepEqual(queue.get("A"), { status: "unavailable", reason: "GeckoTerminal : HTTP 404", fetchedAt: T0 });
    assert.equal(queue.get("B")?.status, "ok");
    assert.equal(calls.length, 2);
});

test("les abonnés sont prévenus à chaque changement d'état", async () => {
    const { clock, queue } = setup();
    let notifications = 0;
    const unsubscribe = queue.subscribe(() => notifications++);
    queue.request("A", 2);
    await clock.advance(1000);
    assert.ok(notifications >= 2, `pending puis ok, reçu ${notifications}`);
    unsubscribe();
    queue.dispose();
});
