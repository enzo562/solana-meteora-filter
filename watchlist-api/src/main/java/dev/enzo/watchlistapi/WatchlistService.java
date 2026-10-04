package dev.enzo.watchlistapi;

import dev.enzo.watchlistapi.WatchlistOverview.AlerterInfo;
import dev.enzo.watchlistapi.WatchlistOverview.WatchlistItem;
import java.io.IOException;
import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

// Règles de gestion de la watchlist (PLAN.md §2). Les méthodes sont synchronized (deux onglets ou deux
// clics rapides ne doivent pas se marcher dessus) et relisent toujours le fichier avant de l'écrire,
// pour ne pas perdre une édition manuelle récente (RG-12).
@Service
public class WatchlistService {
    static final int MAX_LABEL_LENGTH = 40;
    // Au-delà de 3 cycles sans mise à jour de l'état, l'alerteur est considéré inactif (ou en erreur).
    private static final int INACTIVE_AFTER_CYCLES = 3;

    private final WatchlistRepository repository;
    private final AlerterStateReader stateReader;
    private final long scanIntervalMs;
    private final Clock clock;

    public WatchlistService(
            WatchlistRepository repository,
            AlerterStateReader stateReader,
            @Value("${watchlist.alerter-scan-interval-ms}") long scanIntervalMs,
            Clock clock) {
        this.repository = repository;
        this.stateReader = stateReader;
        this.scanIntervalMs = scanIntervalMs;
        this.clock = clock;
    }

    public synchronized WatchlistOverview overview() throws IOException {
        List<WatchlistEntry> entries = repository.read();
        Optional<Map<String, AlerterState>> state = stateReader.read();

        if (state.isEmpty()) {
            List<WatchlistItem> items = entries.stream()
                    .map(e -> new WatchlistItem(e.mint(), e.label(), null, null, null))
                    .toList();
            return new WatchlistOverview(new AlerterInfo(null, false, false), items);
        }

        Map<String, AlerterState> states = state.get();
        List<WatchlistItem> items = entries.stream().map(e -> {
            AlerterState s = states.get(e.mint());
            return new WatchlistItem(e.mint(), e.label(), WatchStatus.of(s),
                    s == null ? null : s.pool(), s == null ? null : s.lastProcessedCandleTs());
        }).toList();

        Long lastActivityMs = states.values().stream()
                .map(AlerterState::updatedAt)
                .filter(Objects::nonNull)
                .max(Long::compare)
                .orElse(null);
        boolean active = lastActivityMs != null
                && clock.millis() - lastActivityMs <= INACTIVE_AFTER_CYCLES * scanIntervalMs;
        return new WatchlistOverview(new AlerterInfo(lastActivityMs, active, true), items);
    }

    public synchronized WatchlistEntry add(String rawMint, String rawLabel) throws IOException {
        String mint = rawMint == null ? "" : rawMint.trim();
        if (!SolanaAddress.isValid(mint)) throw WatchlistException.invalidMint(mint);
        String label = cleanLabel(rawLabel);

        List<WatchlistEntry> entries = repository.read();
        if (entries.stream().anyMatch(e -> e.mint().equals(mint))) throw WatchlistException.duplicate(mint);

        WatchlistEntry entry = new WatchlistEntry(mint, label);
        entries.add(entry);
        repository.write(entries);
        return entry;
    }

    public synchronized WatchlistEntry rename(String mint, String rawLabel) throws IOException {
        String label = cleanLabel(rawLabel);
        List<WatchlistEntry> entries = repository.read();
        int index = indexOf(entries, mint);

        WatchlistEntry renamed = new WatchlistEntry(mint, label);
        entries.set(index, renamed);
        repository.write(entries);
        return renamed;
    }

    public synchronized void remove(String mint) throws IOException {
        List<WatchlistEntry> entries = repository.read();
        entries.remove(indexOf(entries, mint));
        repository.write(entries);
    }

    private static int indexOf(List<WatchlistEntry> entries, String mint) {
        for (int i = 0; i < entries.size(); i++) {
            if (entries.get(i).mint().equals(mint)) return i;
        }
        throw WatchlistException.notFound(mint);
    }

    // RG-04 : optionnel, trim, 40 caractères maximum (comptés en caractères affichés, emoji compris).
    private static String cleanLabel(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String label = raw.trim();
        if (label.codePointCount(0, label.length()) > MAX_LABEL_LENGTH) throw WatchlistException.invalidLabel(MAX_LABEL_LENGTH);
        return label;
    }
}
