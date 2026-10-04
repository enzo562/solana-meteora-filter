package dev.enzo.watchlistapi;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

// .env.example contient INDICATOR_WATCHLIST_PATH= / INDICATOR_STATE_FILE_PATH= vides. L'alerteur Node
// traite une valeur vide comme absente (`?.trim() || défaut`) ; le service doit faire pareil au lieu
// de planter ou de pointer vers un chemin vide.
@SpringBootTest(properties = {
        "INDICATOR_WATCHLIST_PATH=",
        "INDICATOR_STATE_FILE_PATH=",
        "INDICATOR_SCAN_INTERVAL_MS="
})
class EmptyEnvValuesTest {

    @Autowired
    private WatchlistRepository repository;

    @Autowired
    private AlerterStateReader stateReader;

    @Test
    void desValeursVidesRetombentSurLesCheminsParDefautDeLAlerteur() {
        assertEquals(Path.of("../indicator-alerter/watchlist.json").toAbsolutePath().normalize(), repository.file());
        assertEquals(Path.of("../indicator-alerter/.state/state.json").toAbsolutePath().normalize(), stateReader.file());
    }
}
