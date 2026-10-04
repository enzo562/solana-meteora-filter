package dev.enzo.watchlistapi;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AccessDeniedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Repository;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

// Lit et écrit indicator-alerter/watchlist.json, la source de vérité de l'alerteur (RG-01).
@Repository
public class WatchlistRepository {
    private final Path file;
    private final JsonMapper mapper;

    public WatchlistRepository(@Value("${watchlist.file:}") String file, JsonMapper mapper) {
        this.file = Path.of(ConfigValues.orDefault(file, ConfigValues.DEFAULT_WATCHLIST_FILE)).toAbsolutePath().normalize();
        this.mapper = mapper;
    }

    Path file() {
        return file;
    }

    // Mêmes règles que readWatchlist (indicator-alerter/watchlist.ts) : chaîne nue ou { mint, label? },
    // trim, entrées invalides et doublons ignorés, fichier absent ou vide = liste vide. Un JSON
    // invalide lève une exception (RG-09) : on n'écrit jamais par-dessus un fichier qu'on n'a pas compris.
    public List<WatchlistEntry> read() throws IOException {
        if (!Files.exists(file)) return new ArrayList<>();
        String raw = Files.readString(file, StandardCharsets.UTF_8);
        if (raw.isBlank()) return new ArrayList<>();

        List<?> parsed;
        try {
            parsed = mapper.readValue(raw, List.class);
        } catch (JacksonException e) {
            throw new InvalidWatchlistFileException(file, e);
        }

        Set<String> seen = new HashSet<>();
        List<WatchlistEntry> entries = new ArrayList<>();
        for (Object item : parsed) {
            WatchlistEntry entry = normalize(item);
            if (entry != null && seen.add(entry.mint())) entries.add(entry);
        }
        return entries;
    }

    private static WatchlistEntry normalize(Object item) {
        if (item instanceof String s) {
            return s.isBlank() ? null : new WatchlistEntry(s.trim(), null);
        }
        if (item instanceof Map<?, ?> m && m.get("mint") instanceof String mint && !mint.isBlank()) {
            String label = m.get("label") instanceof String l && !l.isBlank() ? l.trim() : null;
            return new WatchlistEntry(mint.trim(), label);
        }
        return null;
    }

    // Écrit dans un fichier temporaire puis le renomme : l'alerteur ne lit jamais un fichier à moitié
    // écrit. Sous Windows, le renommage peut échouer si l'alerteur lit le fichier au même instant :
    // on réessaie brièvement.
    public void write(List<WatchlistEntry> entries) throws IOException {
        Files.createDirectories(file.getParent());
        Path tmp = file.resolveSibling(file.getFileName() + ".tmp");
        Files.writeString(tmp, mapper.writerWithDefaultPrettyPrinter().writeValueAsString(entries) + "\n",
                StandardCharsets.UTF_8);
        for (int attempt = 1; ; attempt++) {
            try {
                Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
                return;
            } catch (AccessDeniedException e) {
                if (attempt == 5) throw e;
                try {
                    Thread.sleep(50L * attempt);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw e;
                }
            }
        }
    }
}
