// État persistant par mint : pool résolu (évite de re-résoudre à chaque cycle) et dernière
// bougie 15m fermée déjà évaluée (idempotence : une bougie n'est jamais réévaluée deux fois,
// et l'ajout d'un nouveau CA à la watchlist démarre par un amorçage silencieux — cf. index.ts).

import { promises as fs } from "node:fs";
import path from "node:path";
import type { StateMap, TokenState } from "./types.ts";

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
    const base = existing ?? { mint, pool: null, lastProcessedCandleTs: null, updatedAt: 0 };
    return { ...base, ...patch, updatedAt: Date.now() };
}
