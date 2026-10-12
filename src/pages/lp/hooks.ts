// Hooks partagés par les listes des techniques (PLAN.md §5). Hors des .tsx pour respecter
// react-refresh/only-export-components.

import { useCallback, useEffect, useState } from "react";
import type { MinuteVolumeQueue } from "../../lib/lp/minuteVolume";

export const REFRESH_MS = 60_000;

export function errorMessage(e: unknown): string {
    return e instanceof Error ? e.message : "Erreur inconnue";
}

export interface AutoRefresh<T> {
    data: T | null; // dernières données reçues, gardées sous le bandeau si un rafraîchissement échoue
    error: string | null;
    loading: boolean;
    updatedAt: string | null;
    refresh: () => void;
}

// Charge au montage puis toutes les 60 s. `load` doit être stable (fonction de module) : sinon
// l'intervalle serait recréé à chaque rendu. Premier chargement dans un setTimeout
// (react-hooks/set-state-in-effect).
export function useAutoRefresh<T>(load: () => Promise<T>): AutoRefresh<T> {
    const [data, setData] = useState<T | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [updatedAt, setUpdatedAt] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            setData(await load());
            setUpdatedAt(new Date().toLocaleTimeString());
            setError(null);
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setLoading(false);
        }
    }, [load]);

    useEffect(() => {
        const first = setTimeout(refresh, 0);
        const interval = setInterval(refresh, REFRESH_MS);
        return () => {
            clearTimeout(first);
            clearInterval(interval);
        };
    }, [refresh]);

    return { data, error, loading, updatedAt, refresh };
}

export function useExpanded(): [Set<string>, (mint: string) => void] {
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const toggle = useCallback((mint: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(mint)) next.delete(mint);
            else next.add(mint);
            return next;
        });
    }, []);
    return [expanded, toggle];
}

// Demandes de volume 1 min d'une liste (§11) : pools des lignes dépliées en priorité 1, puis
// meilleur pool de chaque ligne visible, dans l'ordre d'affichage (priorité 2+), redemandés à
// chaque rafraîchissement de la liste (le cache de 60 s de la file évite les doublons).
export function useListMinuteVolumes(
    volumes: MinuteVolumeQueue,
    bestPools: string[],
    expandedPools: string[],
    updatedAt: string | null
): void {
    const bestKey = bestPools.join(",");
    useEffect(() => {
        bestKey
            .split(",")
            .filter(Boolean)
            .forEach((pool, index) => volumes.request(pool, 2 + index / 1000));
    }, [bestKey, updatedAt, volumes]);

    const expandedKey = expandedPools.join(",");
    useEffect(() => {
        expandedKey
            .split(",")
            .filter(Boolean)
            .forEach((pool) => volumes.request(pool, 1));
    }, [expandedKey, updatedAt, volumes]);
}
