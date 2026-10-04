package dev.enzo.watchlistapi;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.json.JsonMapper;

class WatchlistRepositoryTest {

    private static final String NKE = "NKEda5nHhNGgjrE9nDdMvaEmkmJ96qqxzBVZEcKmjSg";
    private static final String JIM = "Ge87EtsjwRQbHaqQmKRno69RFTwh9bfSsm99XNxTpump";

    @TempDir
    Path dir;

    private WatchlistRepository repo(Path file) {
        return new WatchlistRepository(file.toString(), JsonMapper.builder().build());
    }

    @Test
    void fichierAbsentOuVideDonneUneListeVide() throws Exception {
        assertEquals(List.of(), repo(dir.resolve("absent.json")).read());

        Path blank = dir.resolve("blank.json");
        Files.writeString(blank, "  \n");
        assertEquals(List.of(), repo(blank).read());
    }

    @Test
    void lectureToleranteCommeLAlerteur() throws Exception {
        Path file = dir.resolve("wl.json");
        Files.writeString(file, """
                [
                  "  %s  ",
                  { "mint": "%s", "label": "  Jimothy  " },
                  { "mint": "%s", "label": "doublon ignoré" },
                  { "label": "sans mint" },
                  42,
                  ""
                ]
                """.formatted(NKE, JIM, NKE));

        assertEquals(List.of(new WatchlistEntry(NKE, null), new WatchlistEntry(JIM, "Jimothy")), repo(file).read());
    }

    @Test
    void jsonInvalideLeveUneErreurEtLaisseLeFichierIntact() throws Exception {
        Path file = dir.resolve("wl.json");
        String broken = "[{\"mint\":\"" + NKE + "\",}";
        Files.writeString(file, broken);

        assertThrows(InvalidWatchlistFileException.class, () -> repo(file).read());
        assertEquals(broken, Files.readString(file));
    }

    @Test
    void unObjetAuLieuDUnTableauEstInvalide() throws Exception {
        Path file = dir.resolve("wl.json");
        Files.writeString(file, "{\"mint\":\"" + NKE + "\"}");

        assertThrows(InvalidWatchlistFileException.class, () -> repo(file).read());
    }

    @Test
    void ecritureAtomiquePuisRelectureIdentique() throws Exception {
        Path file = dir.resolve("sous-dossier/wl.json");
        List<WatchlistEntry> entries = List.of(new WatchlistEntry(NKE, "NKE"), new WatchlistEntry(JIM, null));

        repo(file).write(entries);

        assertEquals(entries, repo(file).read());
        String written = Files.readString(file, StandardCharsets.UTF_8);
        assertFalse(written.contains("null"), "un label absent n'est pas écrit : " + written);
        assertTrue(written.trim().startsWith("["), "toujours un tableau (RG-11)");
        assertFalse(Files.exists(file.resolveSibling("wl.json.tmp")), "aucun fichier temporaire restant");
    }
}
