package dev.enzo.watchlistapi;

import java.io.IOException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

// Toutes les erreurs de l'API ont la forme { "error": "<CODE>", "message": "<texte français> " }
// (PLAN.md §6), pour que la page puisse afficher le message tel quel.
@RestControllerAdvice
public class ApiExceptionHandler {

    record ApiError(String error, String message) {}

    @ExceptionHandler(WatchlistException.class)
    ResponseEntity<ApiError> business(WatchlistException e) {
        return ResponseEntity.status(e.status()).body(new ApiError(e.code(), e.getMessage()));
    }

    @ExceptionHandler(InvalidWatchlistFileException.class)
    ResponseEntity<ApiError> invalidFile(InvalidWatchlistFileException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(new ApiError("INVALID_WATCHLIST_FILE", e.getMessage()));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<ApiError> unreadableBody(HttpMessageNotReadableException e) {
        return ResponseEntity.badRequest().body(new ApiError("INVALID_BODY", "Corps de requête JSON illisible."));
    }

    @ExceptionHandler(IOException.class)
    ResponseEntity<ApiError> io(IOException e) {
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(new ApiError("IO_ERROR", "Erreur de lecture ou d'écriture de la watchlist : " + e.getMessage()));
    }
}
