package dev.enzo.watchlistapi;

import java.io.IOException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// Contrat d'API : PLAN.md §6. Le {mint} des URL sert uniquement de clé de recherche, jamais à
// construire un chemin de fichier.
@RestController
@RequestMapping("/api/watchlist")
public class WatchlistController {

    record AddRequest(String mint, String label) {}

    record RenameRequest(String label) {}

    private final WatchlistService service;

    public WatchlistController(WatchlistService service) {
        this.service = service;
    }

    @GetMapping
    public WatchlistOverview overview() throws IOException {
        return service.overview();
    }

    @PostMapping
    public ResponseEntity<WatchlistEntry> add(@RequestBody AddRequest request) throws IOException {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.add(request.mint(), request.label()));
    }

    @PatchMapping("/{mint}")
    public WatchlistEntry rename(@PathVariable String mint, @RequestBody RenameRequest request) throws IOException {
        return service.rename(mint, request.label());
    }

    @DeleteMapping("/{mint}")
    public ResponseEntity<Void> remove(@PathVariable String mint) throws IOException {
        service.remove(mint);
        return ResponseEntity.noContent().build();
    }
}
