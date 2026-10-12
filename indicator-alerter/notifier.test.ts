import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { discordNotifier, telegramNotifier } from "./notifier.ts";
import type { IndicatorAlert } from "./types.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
    globalThis.fetch = realFetch;
});

function captureBody(): { body: () => string } {
    let sent = "";
    globalThis.fetch = async (_url, init) => {
        sent = String(init?.body ?? "");
        return new Response("{}", { status: 200 });
    };
    return { body: () => sent };
}

function alert(inProgress: boolean): IndicatorAlert {
    return {
        mint: "MINT",
        label: "TOK",
        pool: "POOL",
        price: 1.23,
        candleTs: 1_791_000_000,
        inProgress,
        signals: { bbBreakout: true, macdFlip: true, rsiOverbought: false, triggeredCount: 2, qualifies: true },
    };
}

test("le message Telegram signale une bougie en cours, non clôturée", async () => {
    const capture = captureBody();

    await telegramNotifier("TOKEN", "CHAT").send(alert(true));

    assert.match(capture.body(), /en cours, non clôturée/);
});

test("le message Discord signale une bougie en cours, non clôturée", async () => {
    const capture = captureBody();

    await discordNotifier("https://discord.test/webhook").send(alert(true));

    assert.match(capture.body(), /en cours, non clôturée/);
});

test("le message ne parle pas de bougie en cours quand la bougie est clôturée", async () => {
    const capture = captureBody();

    await telegramNotifier("TOKEN", "CHAT").send(alert(false));

    assert.doesNotMatch(capture.body(), /en cours/);
});
