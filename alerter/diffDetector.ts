import type { MeteoraPool } from "./types.ts";

export interface DiffResult {
    isBootstrap: boolean;
    freshPools: MeteoraPool[];
}

// Premier run (état persistant vide) : amorçage silencieux, aucune pool n'est signalée comme
// inédite (RG-06) — évite d'alerter d'un coup sur tout l'historique récent au tout premier cycle.
export function detectNewPools(pools: MeteoraPool[], seenAddresses: Set<string>): DiffResult {
    if (seenAddresses.size === 0) {
        return { isBootstrap: true, freshPools: [] };
    }

    return {
        isBootstrap: false,
        freshPools: pools.filter((p) => !seenAddresses.has(p.address)),
    };
}
