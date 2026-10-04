import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidSolanaAddress } from "./solanaAddress.ts";

test("isValidSolanaAddress accepte de vrais mints", () => {
    assert.equal(isValidSolanaAddress("NKEda5nHhNGgjrE9nDdMvaEmkmJ96qqxzBVZEcKmjSg"), true);
    assert.equal(isValidSolanaAddress("Ge87EtsjwRQbHaqQmKRno69RFTwh9bfSsm99XNxTpump"), true);
});

test("isValidSolanaAddress refuse les chaînes trop courtes ou hors alphabet base58", () => {
    assert.equal(isValidSolanaAddress(""), false);
    assert.equal(isValidSolanaAddress("pasunCA"), false);
    assert.equal(isValidSolanaAddress("0KEda5nHhNGgjrE9nDdMvaEmkmJ96qqxzBVZEcKmjSg"), false);
});

test("isValidSolanaAddress refuse un bon gabarit qui ne se décode pas en 32 octets", () => {
    assert.equal(isValidSolanaAddress("z".repeat(44)), false);
    assert.equal(isValidSolanaAddress("2".repeat(32)), false);
});
