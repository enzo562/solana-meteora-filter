package dev.enzo.watchlistapi;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.json.JsonMapper;

class WatchlistServiceTest {

    private static final String NKE = "NKEda5nHhNGgjrE9nDdMvaEmkmJ96qqxzBVZEcKmjSg";
    private static final String JIM = "Ge87EtsjwRQbHaqQmKRno69RFTwh9bfSsm99XNxTpump";

    @TempDir
    Path dir;

    private Path file;
    private WatchlistRepository repository;
    private WatchlistService service;

    @BeforeEach
    void setUp() {
        file = dir.resolve("watchlist.json");
        repository = new WatchlistRepository(file.toString(), JsonMapper.builder().build());
        service = new WatchlistService(repository);
    }

    private static String codeOf(Runnable action) {
        return assertThrows(WatchlistException.class, action::run).code();
    }

    @Test
    void ajouteUnTokenAvecMintEtLabelNettoyes() throws Exception {
        WatchlistEntry added = service.add("  " + NKE + "  ", "  NKE  ");

        assertEquals(new WatchlistEntry(NKE, "NKE"), added);
        assertEquals(List.of(added), repository.read());
    }

    @Test
    void unLabelVideEquivautAAucunLabel() throws Exception {
        assertEquals(new WatchlistEntry(NKE, null), service.add(NKE, "   "));
    }

    @Test
    void refuseUnMintInvalideSansRienEcrire() {
        assertEquals("INVALID_MINT", codeOf(() -> unchecked(() -> service.add("pasunCA", null))));
        assertFalse(Files.exists(file));
    }

    @Test
    void refuseUnDoublon() throws Exception {
        service.add(NKE, null);
        assertEquals("DUPLICATE_MINT", codeOf(() -> unchecked(() -> service.add(NKE, "autre"))));
    }

    @Test
    void labelLimiteA40Caracteres() throws Exception {
        assertEquals("x".repeat(40), service.add(NKE, "x".repeat(40)).label());
        assertEquals("INVALID_LABEL", codeOf(() -> unchecked(() -> service.add(JIM, "x".repeat(41)))));
    }

    @Test
    void relitLeFichierAvantDEcrirePourNePasPerdreUneEditionManuelle() throws Exception {
        service.add(NKE, null);
        Files.writeString(file, "[\"" + NKE + "\", {\"mint\":\"" + JIM + "\",\"label\":\"ajouté à la main\"}]");

        service.rename(NKE, "NKE");

        assertEquals(List.of(new WatchlistEntry(NKE, "NKE"), new WatchlistEntry(JIM, "ajouté à la main")), repository.read());
    }

    @Test
    void refuseDEcrireSurUnFichierInvalide() throws Exception {
        String broken = "[{\"mint\":";
        Files.writeString(file, broken);

        assertThrows(InvalidWatchlistFileException.class, () -> service.add(NKE, null));
        assertEquals(broken, Files.readString(file));
    }

    @Test
    void renommeEtRetireUnLabel() throws Exception {
        service.add(NKE, "NKE");

        assertEquals(new WatchlistEntry(NKE, "Nike coin"), service.rename(NKE, "Nike coin"));
        assertEquals(new WatchlistEntry(NKE, null), service.rename(NKE, null));
        assertEquals(List.of(new WatchlistEntry(NKE, null)), repository.read());
    }

    @Test
    void retireUnToken() throws Exception {
        service.add(NKE, null);
        service.add(JIM, null);

        service.remove(NKE);

        assertEquals(List.of(new WatchlistEntry(JIM, null)), repository.read());
    }

    @Test
    void renommerOuRetirerUnTokenAbsentRenvoieNotFound() {
        assertEquals("NOT_FOUND", codeOf(() -> unchecked(() -> service.rename(NKE, "x"))));
        assertEquals("NOT_FOUND", codeOf(() -> unchecked(() -> service.remove(NKE))));
    }

    private interface IoAction { void run() throws Exception; }

    private static void unchecked(IoAction action) {
        try {
            action.run();
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
