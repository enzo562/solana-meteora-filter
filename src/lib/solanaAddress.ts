// Validation d'une adresse Solana (mint ou wallet), partagée par le scanner et la page watchlist.
// Même règle côté service Java (watchlist-api, SolanaAddress.java) : base58 + 32 octets décodés.

// Base58, longueur typique d'une adresse Solana (mint ou wallet).
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

// La longueur de la chaîne base58 seule ne garantit pas 32 octets décodés (pas de
// correspondance fixe caractères→octets) — sans décodage réel, une chaîne du bon
// gabarit mais invalide passe le filtre et RugCheck renvoie une erreur HTTP brute
// à la place du message "adresse invalide" attendu.
function base58ByteLength(ca: string): number | null {
    const bytes: number[] = [0];
    for (const char of ca) {
        const value = BASE58_ALPHABET.indexOf(char);
        if (value === -1) return null;
        let carry = value;
        for (let i = 0; i < bytes.length; i++) {
            carry += bytes[i] * 58;
            bytes[i] = carry & 0xff;
            carry >>= 8;
        }
        while (carry > 0) {
            bytes.push(carry & 0xff);
            carry >>= 8;
        }
    }
    for (const char of ca) {
        if (char !== "1") break;
        bytes.push(0);
    }
    return bytes.length;
}

export function isValidSolanaAddress(ca: string): boolean {
    return SOLANA_ADDRESS_RE.test(ca) && base58ByteLength(ca) === 32;
}

// CA passé dans l'URL (`?ca=…`, lien « Scanner » de l'onglet Choix LP) : renvoyé seulement s'il est
// valide, pour ne jamais lancer d'analyse sur une valeur arbitraire.
export function caFromSearch(search: string): string | null {
    const ca = new URLSearchParams(search).get("ca")?.trim() ?? "";
    return isValidSolanaAddress(ca) ? ca : null;
}
