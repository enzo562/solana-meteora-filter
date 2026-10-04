import { test } from "node:test";
import assert from "node:assert/strict";
import { describeStatus, formatCandleTime, inactiveMinutes, readWatchlistError } from "./watchlist.ts";

test("formatCandleTime affiche l'heure d'ouverture de la bougie en UTC", () => {
    // 1791034200 = 2026-10-03 13:30:00 UTC
    assert.equal(formatCandleTime(1791034200), "13:30 UTC");
});

test("describeStatus donne un libellé par statut, avec l'heure de la dernière bougie quand surveillé", () => {
    assert.equal(describeStatus("WATCHING", 1791034200), "✅ Surveillé — dernière bougie 13:30 UTC");
    assert.equal(describeStatus("PENDING_FIRST_CYCLE", null), "⏳ En attente du premier cycle");
    assert.equal(describeStatus("NO_POOL", null), "⚠️ Pool introuvable");
    assert.equal(describeStatus("WARMING_UP", null), "🕒 Token trop récent");
    assert.equal(describeStatus("RETRYING", 1791034200), "🔁 Erreur de récupération");
    assert.equal(describeStatus(null, null), "Statut indisponible");
});

test("inactiveMinutes arrondit à la minute inférieure", () => {
    assert.equal(inactiveMinutes(1_000_000, 1_000_000 + 7 * 60_000 + 59_000), 7);
});

test("readWatchlistError renvoie le message métier du service tel quel", async () => {
    const res = new Response(JSON.stringify({ error: "DUPLICATE_MINT", message: "Déjà dans la watchlist." }), { status: 409 });

    assert.deepEqual(await readWatchlistError(res), { kind: "api", message: "Déjà dans la watchlist." });
});

test("readWatchlistError détecte le service injoignable derrière le proxy Vite", async () => {
    for (const status of [500, 502, 503, 504]) {
        assert.deepEqual(await readWatchlistError(new Response("", { status })), { kind: "unreachable" }, `HTTP ${status}`);
    }
});

test("readWatchlistError formate une erreur non JSON qui n'est pas une panne du service", async () => {
    const result = await readWatchlistError(new Response("Not Found", { status: 404 }));

    assert.equal(result.kind, "api");
    assert.match(result.kind === "api" ? result.message : "", /404/);
});
