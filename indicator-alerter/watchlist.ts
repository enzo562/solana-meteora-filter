// Watchlist dynamique : fichier JSON édité à la main par l'utilisateur, relu à chaque cycle
// (pas besoin de redémarrer le service pour ajouter/retirer un CA).

import { promises as fs } from "node:fs";
import type { WatchlistEntry } from "./types.ts";

type RawEntry = string | { mint: string; label?: string };

function normalize(raw: RawEntry): WatchlistEntry | null {
    if (typeof raw === "string") {
        const mint = raw.trim();
        return mint ? { mint } : null;
    }
    if (raw && typeof raw.mint === "string" && raw.mint.trim()) {
        return { mint: raw.mint.trim(), label: raw.label?.trim() || undefined };
    }
    return null;
}

// Fichier absent ou vide -> watchlist vide (pas une erreur : état de départ normal avant que
// l'utilisateur n'ajoute son premier CA).
export async function readWatchlist(filePath: string): Promise<WatchlistEntry[]> {
    let raw: string;
    try {
        raw = await fs.readFile(filePath, "utf-8");
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw err;
    }

    if (raw.trim() === "") return [];

    const parsed = JSON.parse(raw) as RawEntry[];
    if (!Array.isArray(parsed)) {
        throw new Error(`Watchlist invalide (${filePath}) : le fichier doit contenir un tableau JSON.`);
    }

    const seen = new Set<string>();
    const entries: WatchlistEntry[] = [];
    for (const raw of parsed) {
        const entry = normalize(raw);
        if (!entry || seen.has(entry.mint)) continue;
        seen.add(entry.mint);
        entries.push(entry);
    }
    return entries;
}
