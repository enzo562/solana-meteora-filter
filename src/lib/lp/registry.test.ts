import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TECHNIQUE_ID, TECHNIQUES, techniqueById } from "./registry.ts";

test("le registre propose Vladimir (par défaut) puis Tiago, avec des identifiants uniques", () => {
    assert.deepEqual(TECHNIQUES.map((t) => t.id), ["vladimir", "tiago"]);
    assert.equal(DEFAULT_TECHNIQUE_ID, "vladimir");
    assert.equal(new Set(TECHNIQUES.map((t) => t.id)).size, TECHNIQUES.length);
});

test("techniqueById retombe sur la technique par défaut pour un identifiant inconnu", () => {
    assert.equal(techniqueById("vladimir").id, "vladimir");
    assert.equal(techniqueById("tiago").id, "tiago");
    assert.equal(techniqueById("inconnue").id, DEFAULT_TECHNIQUE_ID);
});
