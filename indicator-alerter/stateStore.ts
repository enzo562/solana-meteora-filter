// État persistant par mint : pool résolu (évite de re-résoudre à chaque cycle), dernière bougie
// 15m fermée déjà évaluée (idempotence : une bougie fermée n'est jamais réévaluée deux fois, et
// l'ajout d'un nouveau CA à la watchlist démarre par un amorçage silencieux — cf. index.ts) et
// dernière bougie ayant alerté (une bougie, même réévaluée en cours, n'alerte qu'une fois).

import { promises as fs } from "node:fs";
import path from "node:path";
import type { StateMap, TokenState, WatchlistEntry } from "./types.ts";

export async function readState(filePath: string): Promise<StateMap> {
    try {
        const raw = await fs.readFile(filePath, "utf-8");
        return JSON.parse(raw) as StateMap;
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
        throw err;
    }
}

export async function writeState(filePath: string, state: StateMap): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(state, null, 2), "utf-8");
}

// Calcule la nouvelle entrée d'état d'UN SEUL mint (pas la map entière) : quand plusieurs tokens
// sont traités en parallèle (Promise.allSettled dans index.ts), chaque appel ne doit modifier que
// sa propre entrée, sinon fusionner des copies de la map entière calculées depuis le même
// instantané de départ écraserait les mises à jour des autres tokens du même cycle.
export function nextTokenState(existing: TokenState | undefined, mint: string, patch: Partial<TokenState>): TokenState {
    const base = existing ?? { mint, pool: null, lastProcessedCandleTs: null, lastAlertedCandleTs: null, updatedAt: 0 };
    return { ...base, ...patch, updatedAt: Date.now() };
}

// Supprime (en place) l'état des tokens retirés de la watchlist et renvoie leurs mints. Sans ça, un
// token rajouté plus tard retrouverait son ancien lastProcessedCandleTs, sauterait l'amorçage
// silencieux et rattraperait des bougies anciennes — avec à la clé une alerte sur un vieux signal.
export function purgeRemovedTokens(state: StateMap, watchlist: WatchlistEntry[]): string[] {
    const watched = new Set(watchlist.map((e) => e.mint));
    const purged = Object.keys(state).filter((mint) => !watched.has(mint));
    for (const mint of purged) delete state[mint];
    return purged;
}
