// Types et logique pure de la page /watchlist (contrat d'API : docs/specs/watchlist-web/PLAN.md §6).
// Séparés de la page pour être testables avec node:test, sans navigateur.

import { formatApiFailure, readApiFailure } from "./apiError.ts";

export type WatchStatus = "PENDING_FIRST_CYCLE" | "NO_POOL" | "WARMING_UP" | "RETRYING" | "WATCHING";

export interface WatchlistItem {
    mint: string;
    label?: string;
    status: WatchStatus | null;
    pool: string | null;
    lastProcessedCandleTs: number | null;
}

export interface WatchlistResponse {
    alerter: { lastActivityMs: number | null; active: boolean; stateReadable: boolean };
    items: WatchlistItem[];
}

export type WatchlistError = { kind: "unreachable" } | { kind: "api"; message: string };

const STATUS_LABELS: Record<WatchStatus, string> = {
    PENDING_FIRST_CYCLE: "⏳ En attente du premier cycle",
    NO_POOL: "⚠️ Pool introuvable",
    WARMING_UP: "🕒 Token trop récent",
    RETRYING: "🔁 Erreur de récupération",
    WATCHING: "✅ Surveillé",
};

// lastProcessedCandleTs = heure d'OUVERTURE de la bougie, en secondes Unix.
export function formatCandleTime(ts: number): string {
    return new Date(ts * 1000).toISOString().slice(11, 16) + " UTC";
}

export function describeStatus(status: WatchStatus | null, lastProcessedCandleTs: number | null): string {
    if (status === null) return "Statut indisponible";
    if (status === "WATCHING" && lastProcessedCandleTs !== null) {
        return `${STATUS_LABELS.WATCHING} — dernière bougie ${formatCandleTime(lastProcessedCandleTs)}`;
    }
    return STATUS_LABELS[status];
}

export function inactiveMinutes(lastActivityMs: number, nowMs: number): number {
    return Math.floor((nowMs - lastActivityMs) / 60_000);
}

// Le service renvoie toujours { error, message } (message en français, affichable tel quel). Quand
// Spring est arrêté, le proxy Vite répond 5xx sans ce corps : c'est « service injoignable ».
export async function readWatchlistError(res: Response): Promise<WatchlistError> {
    const fallback = res.clone();
    const text = await res.text();
    try {
        const body = JSON.parse(text) as { error?: unknown; message?: unknown };
        if (typeof body.error === "string" && typeof body.message === "string") {
            return { kind: "api", message: body.message };
        }
    } catch {
        // corps non JSON : traité ci-dessous
    }
    if (res.status >= 500) return { kind: "unreachable" };
    return { kind: "api", message: formatApiFailure(await readApiFailure("Service watchlist", fallback)) };
}
