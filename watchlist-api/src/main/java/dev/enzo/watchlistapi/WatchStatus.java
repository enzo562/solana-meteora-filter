package dev.enzo.watchlistapi;

// Statut de surveillance d'un token, déduit de son entrée dans state.json (PLAN.md §4).
public enum WatchStatus {
    PENDING_FIRST_CYCLE,
    NO_POOL,
    WARMING_UP,
    RETRYING,
    WATCHING;

    static WatchStatus of(AlerterState s) {
        if (s == null) return PENDING_FIRST_CYCLE;
        boolean hasPool = s.pool() != null;
        boolean evaluated = s.lastProcessedCandleTs() != null;
        if (!evaluated) return hasPool ? WARMING_UP : NO_POOL;
        return hasPool ? WATCHING : RETRYING;
    }
}
