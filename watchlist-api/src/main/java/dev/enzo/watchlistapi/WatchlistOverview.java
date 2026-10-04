package dev.enzo.watchlistapi;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

// Réponse de GET /api/watchlist (PLAN.md §6).
public record WatchlistOverview(AlerterInfo alerter, List<WatchlistItem> items) {

    // lastActivityMs = max(updatedAt) de l'état, null s'il est vide ; stateReadable = false si
    // state.json était momentanément illisible (statuts alors indisponibles).
    public record AlerterInfo(Long lastActivityMs, boolean active, boolean stateReadable) {}

    // status, pool et lastProcessedCandleTs valent null quand l'état est illisible.
    public record WatchlistItem(
            String mint,
            @JsonInclude(JsonInclude.Include.NON_NULL) String label,
            WatchStatus status,
            String pool,
            Long lastProcessedCandleTs) {}
}
