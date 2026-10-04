import { test } from "node:test";
import assert from "node:assert/strict";
import { purgeRemovedTokens } from "./stateStore.ts";
import type { StateMap, TokenState } from "./types.ts";

function tokenState(mint: string): TokenState {
    return { mint, pool: `pool-${mint}`, lastProcessedCandleTs: 1_791_034_200, updatedAt: 1 };
}

test("purgeRemovedTokens supprime l'état des tokens absents de la watchlist", () => {
    const state: StateMap = { A: tokenState("A"), B: tokenState("B"), C: tokenState("C") };

    const purged = purgeRemovedTokens(state, [{ mint: "A" }, { mint: "C", label: "Cee" }]);

    assert.deepEqual(purged, ["B"]);
    assert.deepEqual(Object.keys(state), ["A", "C"]);
});

test("purgeRemovedTokens ne touche à rien quand tous les tokens sont encore surveillés", () => {
    const state: StateMap = { A: tokenState("A") };

    const purged = purgeRemovedTokens(state, [{ mint: "A" }]);

    assert.deepEqual(purged, []);
    assert.deepEqual(state, { A: tokenState("A") });
});

test("purgeRemovedTokens vide tout l'état quand la watchlist est vide", () => {
    const state: StateMap = { A: tokenState("A"), B: tokenState("B") };

    const purged = purgeRemovedTokens(state, []);

    assert.deepEqual(purged.sort(), ["A", "B"]);
    assert.deepEqual(state, {});
});
