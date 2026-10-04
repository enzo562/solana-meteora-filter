package dev.enzo.watchlistapi;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.json.JsonMapper;

class AlerterStateReaderTest {

    private static final String NKE = "NKEda5nHhNGgjrE9nDdMvaEmkmJ96qqxzBVZEcKmjSg";

    @TempDir
    Path dir;

    private AlerterStateReader reader(Path file) {
        return new AlerterStateReader(file.toString(), JsonMapper.builder().build());
    }

    @Test
    void etatAbsentDonneUneMapVide() {
        assertEquals(Optional.of(Map.of()), reader(dir.resolve("absent.json")).read());
    }

    @Test
    void litLEtatEcritParLAlerteurEnIgnorantLesChampsInconnus() throws Exception {
        Path file = dir.resolve("state.json");
        Files.writeString(file, """
                { "%s": { "mint": "%s", "pool": "6kRo", "lastProcessedCandleTs": 1791034200,
                          "updatedAt": 1791035219807, "champFutur": true } }
                """.formatted(NKE, NKE));

        assertEquals(Optional.of(Map.of(NKE, new AlerterState(NKE, "6kRo", 1791034200L, 1791035219807L))),
                reader(file).read());
    }

    @Test
    void unEtatTronqueEnCoursDEcritureEstSignaleIllisible() throws Exception {
        Path file = dir.resolve("state.json");
        Files.writeString(file, "{ \"" + NKE + "\": { \"mint\": ");

        assertEquals(Optional.empty(), reader(file).read());
    }
}
