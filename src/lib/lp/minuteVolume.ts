// Volume 1 min / 5 min par pool (docs/specs/lp-picker/PLAN.md §11), via les bougies minute de
// GeckoTerminal — la seule source gratuite à la minute, mais à un appel par pool et avec une limite
// d'environ 30 appels/min partagée avec indicator-alerter (même machine). RG-09 : tous les appels de
// l'onglet passent par UNE file, espacée, priorisée, avec cache et pause sur 429.

export const GECKO_OHLCV_URL = "https://api.geckoterminal.com/api/v2/networks/solana/pools";
export const MIN_INTERVAL_MS = 2_500; // ~24 appels/min, marge laissée à indicator-alerter
export const CACHE_TTL_MS = 60_000;
export const RATE_LIMIT_PAUSE_MS = 30_000;

const CANDLE_MS = 60_000;

export interface MinuteVolume {
    lastMinute: number; // volume ($) de la dernière minute clôturée
    last5Minutes: number; // somme des 5 dernières minutes clôturées
    candleTs: number; // ouverture (s) de la dernière minute clôturée
}

export type MinuteVolumeState =
    | { status: "pending" }
    | { status: "ok"; value: MinuteVolume; fetchedAt: number }
    | { status: "unavailable"; reason: string; fetchedAt: number };

// Bougies GeckoTerminal [ts ouverture (s), o, h, l, c, volume]. La minute encore ouverte est écartée
// (son volume est partiel ; indicator-alerter, lui, évalue la bougie en cours depuis le 2026-10-09).
export function parseMinuteVolume(ohlcvList: number[][], nowMs: number): MinuteVolume | null {
    const closed = ohlcvList
        .filter((c) => c[0] * 1000 + CANDLE_MS <= nowMs)
        .sort((a, b) => b[0] - a[0]);
    if (closed.length === 0) return null;
    return {
        lastMinute: closed[0][5],
        last5Minutes: closed.slice(0, 5).reduce((sum, c) => sum + c[5], 0),
        candleTs: closed[0][0],
    };
}

export interface MinuteVolumeQueueDeps {
    fetchPool(pool: string): Promise<Response>;
    now(): number;
    setTimer(fn: () => void, ms: number): unknown;
    clearTimer(handle: unknown): void;
}

export interface MinuteVolumeQueue {
    // priority : 0 = recherche par CA, 1 = ligne dépliée, 2+ = liste (ordre d'affichage)
    request(pool: string, priority: number): void;
    get(pool: string): MinuteVolumeState | undefined;
    subscribe(listener: () => void): () => void;
    dispose(): void;
}

export function createMinuteVolumeQueue(deps: MinuteVolumeQueueDeps): MinuteVolumeQueue {
    const states = new Map<string, MinuteVolumeState>();
    const waiting = new Map<string, { priority: number; seq: number }>();
    const listeners = new Set<() => void>();
    let seq = 0;
    let inFlight: string | null = null;
    let timer: unknown = null;
    let lastCallAt = -Infinity;
    let pausedUntil = -Infinity;
    let disposed = false;

    const notify = () => listeners.forEach((l) => l());

    function enqueue(pool: string, priority: number) {
        const existing = waiting.get(pool);
        if (existing) {
            existing.priority = Math.min(existing.priority, priority);
            return;
        }
        waiting.set(pool, { priority, seq: seq++ });
    }

    function schedule() {
        if (disposed || timer !== null || inFlight !== null || waiting.size === 0) return;
        const delay = Math.max(0, lastCallAt + MIN_INTERVAL_MS - deps.now(), pausedUntil - deps.now());
        timer = deps.setTimer(run, delay);
    }

    async function run() {
        timer = null;
        if (disposed) return;
        let pick: string | null = null;
        let best: { priority: number; seq: number } | null = null;
        for (const [pool, entry] of waiting) {
            if (!best || entry.priority < best.priority || (entry.priority === best.priority && entry.seq < best.seq)) {
                pick = pool;
                best = entry;
            }
        }
        if (pick === null || best === null) return;
        waiting.delete(pick);
        inFlight = pick;
        lastCallAt = deps.now();

        // Pause + nouvel essai du pool, pour un 429 comme pour une erreur réseau.
        const pauseAndRetry = (pool: string, priority: number, reason: string) => {
            pausedUntil = deps.now() + RATE_LIMIT_PAUSE_MS;
            states.set(pool, { status: "unavailable", reason: `${reason}, nouvel essai dans ${RATE_LIMIT_PAUSE_MS / 1000} s`, fetchedAt: deps.now() });
            enqueue(pool, priority);
        };

        try {
            const res = await deps.fetchPool(pick);
            if (res.status === 429) {
                pauseAndRetry(pick, best.priority, "Limite de requêtes GeckoTerminal atteinte");
            } else if (!res.ok) {
                states.set(pick, { status: "unavailable", reason: `GeckoTerminal : HTTP ${res.status}`, fetchedAt: deps.now() });
            } else {
                const json = (await res.json()) as { data?: { attributes?: { ohlcv_list?: number[][] } } };
                const value = parseMinuteVolume(json.data?.attributes?.ohlcv_list ?? [], deps.now());
                states.set(
                    pick,
                    value
                        ? { status: "ok", value, fetchedAt: deps.now() }
                        : { status: "unavailable", reason: "Aucune minute clôturée", fetchedAt: deps.now() },
                );
            }
        } catch {
            // Dans le navigateur, le 429 de GeckoTerminal arrive SANS en-tête CORS : fetch lève alors
            // une simple erreur réseau. On la traite comme une limite probable, sinon la file
            // continuerait d'appeler toutes les 2,5 s et entretiendrait le blocage.
            pauseAndRetry(pick, best.priority, "GeckoTerminal injoignable ou limite de requêtes atteinte");
        } finally {
            inFlight = null;
            notify();
            schedule();
        }
    }

    return {
        request(pool, priority) {
            if (disposed || pool === inFlight) return;
            const state = states.get(pool);
            if (state && state.status !== "pending" && deps.now() - state.fetchedAt < CACHE_TTL_MS && !waiting.has(pool)) return;
            enqueue(pool, priority);
            if (!state) {
                states.set(pool, { status: "pending" });
                notify();
            }
            schedule();
        },
        get: (pool) => states.get(pool),
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        dispose() {
            disposed = true;
            if (timer !== null) deps.clearTimer(timer);
            timer = null;
            waiting.clear();
            listeners.clear();
        },
    };
}

// Instance réelle (navigateur) : fetch GeckoTerminal + vrais timers.
export function createBrowserMinuteVolumeQueue(): MinuteVolumeQueue {
    return createMinuteVolumeQueue({
        fetchPool: (pool) =>
            fetch(`${GECKO_OHLCV_URL}/${pool}/ohlcv/minute?aggregate=1&limit=6&currency=usd`, {
                headers: { accept: "application/json" },
            }),
        now: () => Date.now(),
        setTimer: (fn, ms) => setTimeout(fn, ms),
        clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    });
}
