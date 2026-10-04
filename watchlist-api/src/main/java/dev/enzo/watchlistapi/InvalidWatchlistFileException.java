package dev.enzo.watchlistapi;

import java.nio.file.Path;

// RG-09 : le fichier n'a pas été compris, le service refuse d'écrire tant qu'il n'est pas corrigé.
public class InvalidWatchlistFileException extends RuntimeException {

    public InvalidWatchlistFileException(Path file, Throwable cause) {
        super("Le fichier " + file + " n'est pas une watchlist valide (tableau JSON attendu) : "
                + cause.getMessage()
                + " — corrige-le à la main ; aucune modification n'est enregistrée tant qu'il est invalide.", cause);
    }
}
