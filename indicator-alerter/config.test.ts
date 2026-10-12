import { test } from "node:test";
import assert from "node:assert/strict";
import { exceedsGeckoBudget, loadConfig } from "./config.ts";

const DISCORD_ENV = { ALERT_CHANNELS: "discord", DISCORD_WEBHOOK_URL: "https://discord.test/webhook" };

test("loadConfig scanne toutes les 60 s par défaut", () => {
    assert.equal(loadConfig(DISCORD_ENV).scanIntervalMs, 60_000);
});

test("exceedsGeckoBudget tolère 6 appels/min (6 tokens toutes les 60 s)", () => {
    assert.equal(exceedsGeckoBudget(6, 60_000), false);
});

test("exceedsGeckoBudget signale plus de 6 appels/min (4 tokens toutes les 30 s)", () => {
    assert.equal(exceedsGeckoBudget(4, 30_000), true);
});
