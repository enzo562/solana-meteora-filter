package dev.enzo.watchlistapi;

// Valeurs par défaut identiques à celles de l'alerteur (indicator-alerter/config.ts), avec la même
// règle : une variable vide ou absente vaut sa valeur par défaut (`env.X?.trim() || défaut` côté
// Node). Les placeholders Spring `${X:défaut}` ne couvrent que l'absence, pas la valeur vide que
// contient .env.example.
final class ConfigValues {
    // Relatifs au dossier de lancement du service (watchlist-api/).
    static final String DEFAULT_WATCHLIST_FILE = "../indicator-alerter/watchlist.json";
    static final String DEFAULT_STATE_FILE = "../indicator-alerter/.state/state.json";
    static final long DEFAULT_SCAN_INTERVAL_MS = 120_000;

    private ConfigValues() {}

    static String orDefault(String raw, String defaultValue) {
        return raw == null || raw.isBlank() ? defaultValue : raw.trim();
    }

    static long millisOrDefault(String raw, long defaultValue) {
        return raw == null || raw.isBlank() ? defaultValue : Long.parseLong(raw.trim());
    }
}
