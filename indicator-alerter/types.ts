// Formes alignées sur les réponses de l'API publique GeckoTerminal (api.geckoterminal.com/api/v2).

export interface Candle {
    ts: number; // unix seconds, heure d'OUVERTURE de la bougie (GeckoTerminal ; cf. ohlcvClient.ts)
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

// GET /networks/solana/pools/{pool}/ohlcv/minute?aggregate=15&limit=N&currency=usd
export interface GeckoTerminalOhlcvResponse {
    data: {
        attributes: {
            ohlcv_list: [number, number, number, number, number, number][];
        };
    };
}

// GET /networks/solana/tokens/{mint}/pools
export interface GeckoTerminalPoolsResponse {
    data: {
        attributes: {
            address: string;
            name: string;
            reserve_in_usd: string | null;
            volume_usd?: { h24?: string };
        };
    }[];
}

export interface WatchlistEntry {
    mint: string;
    label?: string;
}

// Bougies d'un pool découpées par ohlcvClient.ts : les fermées (triées ancien -> récent) et la
// bougie 15m en cours, dont le close est le prix actuel (null si aucun trade depuis son ouverture).
export interface CandleSet {
    closed: Candle[];
    current: Candle | null;
}

// État persistant minimal par token : pool résolu (évite de re-résoudre à chaque cycle), dernière
// bougie 15m FERMÉE déjà évaluée (idempotence + amorçage silencieux, cf. stateStore.ts) et
// dernière bougie ayant déjà alerté (fermée ou en cours : une bougie n'alerte qu'une fois).
export interface TokenState {
    mint: string;
    pool: string | null;
    lastProcessedCandleTs: number | null;
    // Absent des fichiers d'état écrits avant 2026-10-09 : à lire avec `?? null`.
    lastAlertedCandleTs: number | null;
    updatedAt: number;
}

export type StateMap = Record<string, TokenState>;

export interface SignalEvaluation {
    bbBreakout: boolean;
    macdFlip: boolean;
    rsiOverbought: boolean;
    triggeredCount: number;
    qualifies: boolean; // au moins 2 signaux sur 3
}

export interface IndicatorAlert {
    mint: string;
    label: string;
    pool: string;
    price: number;
    candleTs: number;
    inProgress: boolean; // bougie encore ouverte : le signal peut disparaître avant la clôture
    signals: SignalEvaluation;
}

export interface Notifier {
    readonly name: string;
    send(alert: IndicatorAlert): Promise<void>;
}
