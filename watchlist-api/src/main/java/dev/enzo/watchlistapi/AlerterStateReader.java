package dev.enzo.watchlistapi;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

// Lecture SEULE de indicator-alerter/.state/state.json : seul l'alerteur l'écrit (RG-07).
@Component
public class AlerterStateReader {
    private static final TypeReference<Map<String, AlerterState>> TYPE = new TypeReference<>() {};
    private static final int ATTEMPTS = 3;

    private final Path file;
    private final JsonMapper mapper;

    public AlerterStateReader(@Value("${watchlist.state-file}") String file, JsonMapper mapper) {
        this.file = Path.of(file).toAbsolutePath().normalize();
        this.mapper = mapper;
    }

    // Node écrit ce fichier de façon non atomique : un contenu tronqué veut dire « en cours
    // d'écriture ». On réessaie brièvement, puis Optional.empty() = état momentanément illisible.
    public Optional<Map<String, AlerterState>> read() {
        for (int attempt = 1; attempt <= ATTEMPTS; attempt++) {
            try {
                if (!Files.exists(file)) return Optional.of(Map.of());
                return Optional.of(mapper.readValue(Files.readString(file, StandardCharsets.UTF_8), TYPE));
            } catch (IOException | JacksonException e) {
                if (attempt == ATTEMPTS) break;
                try {
                    Thread.sleep(100);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        }
        return Optional.empty();
    }
}
