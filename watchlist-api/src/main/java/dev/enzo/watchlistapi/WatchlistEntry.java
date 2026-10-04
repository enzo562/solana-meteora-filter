package dev.enzo.watchlistapi;

import com.fasterxml.jackson.annotation.JsonInclude;

// label absent du JSON quand il est null : même forme que les entrées écrites à la main.
@JsonInclude(JsonInclude.Include.NON_NULL)
public record WatchlistEntry(String mint, String label) {}
