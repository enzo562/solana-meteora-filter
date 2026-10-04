package dev.enzo.watchlistapi;

import java.math.BigInteger;
import java.util.regex.Pattern;

// RG-02 : même règle que isValidSolanaAddress côté SPA (TokenScannerPage.tsx).
public final class SolanaAddress {
    private static final Pattern FORMAT = Pattern.compile("^[1-9A-HJ-NP-Za-km-z]{32,44}$");
    private static final String ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    private static final BigInteger BASE = BigInteger.valueOf(58);

    private SolanaAddress() {}

    // Le gabarit seul ne garantit pas 32 octets décodés : on décode réellement le base58.
    public static boolean isValid(String address) {
        if (address == null || !FORMAT.matcher(address).matches()) return false;
        BigInteger value = BigInteger.ZERO;
        for (char c : address.toCharArray()) {
            value = value.multiply(BASE).add(BigInteger.valueOf(ALPHABET.indexOf(c)));
        }
        int leadingZeroBytes = 0;
        while (leadingZeroBytes < address.length() && address.charAt(leadingZeroBytes) == '1') leadingZeroBytes++;
        int bodyBytes = value.signum() == 0 ? 0 : (value.bitLength() + 7) / 8;
        return leadingZeroBytes + bodyBytes == 32;
    }
}
