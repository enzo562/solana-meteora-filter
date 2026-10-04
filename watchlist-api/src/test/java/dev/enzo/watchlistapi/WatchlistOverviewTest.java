package dev.enzo.watchlistapi;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.enzo.watchlistapi.WatchlistOverview.WatchlistItem;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.json.JsonMapper;

class WatchlistOverviewTest {

    private static final long SCAN_INTERVAL_MS = 120_000;
    private static final long NOW_MS = 1_791_035_000_000L;

    @TempDir
    Path dir;

    private WatchlistOverview overview(String watchlistJson, String stateJson) throws Exception {
        Path wl = dir.resolve("watchlist.json");
        Path state = dir.resolve("state.json");
        Files.writeString(wl, watchlistJson);
        if (stateJson != null) Files.writeString(state, stateJson);
        JsonMapper mapper = JsonMapper.builder().build();
        WatchlistService service = new WatchlistService(
                new WatchlistRepository(wl.toString(), mapper),
                new AlerterStateReader(state.toString(), mapper),
                SCAN_INTERVAL_MS,
                Clock.fixed(Instant.ofEpochMilli(NOW_MS), ZoneOffset.UTC));
        return service.overview();
    }

    @Test
    void deduitLesCinqStatutsDeLEtatDeLAlerteur() throws Exception {
        WatchlistOverview o = overview("""
                ["PENDING", {"mint":"NOPOOL","label":"sans pool"}, "WARMUP", "RETRY", "OK"]
                """, """
                {
                  "NOPOOL": {"mint":"NOPOOL","pool":null,"lastProcessedCandleTs":null,"updatedAt":1},
                  "WARMUP": {"mint":"WARMUP","pool":"p3","lastProcessedCandleTs":null,"updatedAt":1},
                  "RETRY":  {"mint":"RETRY","pool":null,"lastProcessedCandleTs":1791034200,"updatedAt":1},
                  "OK":     {"mint":"OK","pool":"p5","lastProcessedCandleTs":1791034200,"updatedAt":1}
                }
                """);

        assertEquals(List.of(
                new WatchlistItem("PENDING", null, WatchStatus.PENDING_FIRST_CYCLE, null, null),
                new WatchlistItem("NOPOOL", "sans pool", WatchStatus.NO_POOL, null, null),
                new WatchlistItem("WARMUP", null, WatchStatus.WARMING_UP, "p3", null),
                new WatchlistItem("RETRY", null, WatchStatus.RETRYING, null, 1791034200L),
                new WatchlistItem("OK", null, WatchStatus.WATCHING, "p5", 1791034200L)), o.items());
        assertTrue(o.alerter().stateReadable());
    }

    @Test
    void alerteurActifJusquATroisCyclesSansMiseAJour() throws Exception {
        long justInside = NOW_MS - 3 * SCAN_INTERVAL_MS;
        WatchlistOverview recent = overview("[\"A\"]",
                "{\"A\":{\"mint\":\"A\",\"pool\":\"p\",\"lastProcessedCandleTs\":1,\"updatedAt\":" + justInside + "}}");
        assertEquals(justInside, recent.alerter().lastActivityMs());
        assertTrue(recent.alerter().active());

        WatchlistOverview stale = overview("[\"A\"]",
                "{\"A\":{\"mint\":\"A\",\"pool\":\"p\",\"lastProcessedCandleTs\":1,\"updatedAt\":" + (justInside - 1) + "}}");
        assertFalse(stale.alerter().active());
    }

    @Test
    void etatVideDonneUneActiviteInconnue() throws Exception {
        WatchlistOverview o = overview("[]", null);

        assertNull(o.alerter().lastActivityMs());
        assertFalse(o.alerter().active());
        assertTrue(o.alerter().stateReadable());
    }

    @Test
    void etatIllisibleDonneDesStatutsIndisponibles() throws Exception {
        WatchlistOverview o = overview("[\"A\"]", "{\"A\":{\"mint\":");

        assertFalse(o.alerter().stateReadable());
        assertEquals(List.of(new WatchlistItem("A", null, null, null, null)), o.items());
    }
}
