package dev.enzo.watchlistapi;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class SolanaAddressTest {

    @Test
    void accepteDeVraisMints() {
        assertTrue(SolanaAddress.isValid("NKEda5nHhNGgjrE9nDdMvaEmkmJ96qqxzBVZEcKmjSg"));
        assertTrue(SolanaAddress.isValid("Ge87EtsjwRQbHaqQmKRno69RFTwh9bfSsm99XNxTpump"));
    }

    @Test
    void refuseNullVideEtTropCourt() {
        assertFalse(SolanaAddress.isValid(null));
        assertFalse(SolanaAddress.isValid(""));
        assertFalse(SolanaAddress.isValid("pasunCA"));
    }

    @Test
    void refuseLesCaracteresHorsAlphabetBase58() {
        // 0, O, I et l n'existent pas en base58.
        assertFalse(SolanaAddress.isValid("0KEda5nHhNGgjrE9nDdMvaEmkmJ96qqxzBVZEcKmjSg"));
        assertFalse(SolanaAddress.isValid("NKEda5nHhNGgjrE9nDdMvaEmkmJ96qqxzBVZEcKmjSO"));
        assertFalse(SolanaAddress.isValid("NKEda5nHhNGgjrE9nDdMvaEmkmJ96qqxzBVZEcKmjSI"));
        assertFalse(SolanaAddress.isValid("NKEda5nHhNGgjrE9nDdMvaEmkmJ96qqxzBVZEcKmjSl"));
    }

    @Test
    void refuseUnBonGabaritQuiNeSeDecodePasEn32Octets() {
        assertFalse(SolanaAddress.isValid("z".repeat(44)), "44 'z' = 33 octets décodés");
        assertFalse(SolanaAddress.isValid("2".repeat(32)), "32 '2' = moins de 32 octets décodés");
    }
}
