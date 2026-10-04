package dev.enzo.watchlistapi;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

// Miroir de TokenState (indicator-alerter/types.ts). lastProcessedCandleTs : secondes Unix, heure
// d'OUVERTURE de la bougie ; updatedAt : millisecondes Unix.
@JsonIgnoreProperties(ignoreUnknown = true)
public record AlerterState(String mint, String pool, Long lastProcessedCandleTs, Long updatedAt) {}
