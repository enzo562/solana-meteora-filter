package dev.enzo.watchlistapi;

import java.io.IOException;
import java.util.List;
import org.springframework.stereotype.Service;

// Règles de gestion de la watchlist (PLAN.md §2). Les méthodes sont synchronized (deux onglets ou deux
// clics rapides ne doivent pas se marcher dessus) et relisent toujours le fichier avant de l'écrire,
// pour ne pas perdre une édition manuelle récente (RG-12).
@Service
public class WatchlistService {
    static final int MAX_LABEL_LENGTH = 40;

    private final WatchlistRepository repository;

    public WatchlistService(WatchlistRepository repository) {
        this.repository = repository;
    }

    public synchronized List<WatchlistEntry> list() throws IOException {
        return repository.read();
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
