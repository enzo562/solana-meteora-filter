package dev.enzo.watchlistapi;

import org.springframework.http.HttpStatus;

// Erreur métier : porte le code HTTP et le code d'erreur du contrat d'API (PLAN.md §6).
// Le message est en français et s'affiche tel quel dans la page.
public class WatchlistException extends RuntimeException {
    private final HttpStatus status;
    private final String code;

    private WatchlistException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public HttpStatus status() {
        return status;
    }

    public String code() {
        return code;
    }

    static WatchlistException invalidMint(String mint) {
        return new WatchlistException(HttpStatus.BAD_REQUEST, "INVALID_MINT",
                "Adresse Solana invalide : « " + mint + " ».");
    }

    static WatchlistException invalidLabel(int max) {
        return new WatchlistException(HttpStatus.BAD_REQUEST, "INVALID_LABEL",
                "Le label ne peut pas dépasser " + max + " caractères.");
    }

    static WatchlistException duplicate(String mint) {
        return new WatchlistException(HttpStatus.CONFLICT, "DUPLICATE_MINT",
                "Ce token est déjà dans la watchlist : " + mint + ".");
    }

    static WatchlistException notFound(String mint) {
        return new WatchlistException(HttpStatus.NOT_FOUND, "NOT_FOUND",
                "Ce token n'est pas dans la watchlist : " + mint + ".");
    }
}
