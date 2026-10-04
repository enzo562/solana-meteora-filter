import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { resolveMostLiquidPool } from "./poolResolver.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
    globalThis.fetch = realFetch;
});

function respondWith(status: number, body: unknown): void {
    globalThis.fetch = async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function pool(address: string, reserve: string | null, volume24h = "0") {
    return { attributes: { address, name: address, reserve_in_usd: reserve, volume_usd: { h24: volume24h } } };
}

test("resolveMostLiquidPool choisit le pool le plus liquide", async () => {
    respondWith(200, { data: [pool("petit", "100"), pool("gros", "5000"), pool("moyen", "900")] });

    assert.equal(await resolveMostLiquidPool("MINT"), "gros");
});

test("resolveMostLiquidPool renvoie null quand GeckoTerminal ne connaît pas le token (404)", async () => {
    respondWith(404, { errors: [{ status: "404", title: "Not Found" }] });

    assert.equal(await resolveMostLiquidPool("MINT"), null);
});

test("resolveMostLiquidPool lève toujours sur une vraie erreur d'API", async () => {
    respondWith(500, { errors: [{ status: "500", title: "Internal Server Error" }] });

    await assert.rejects(resolveMostLiquidPool("MINT"));
});
