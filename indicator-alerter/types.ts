// Formes alignées sur les réponses de l'API publique GeckoTerminal (api.geckoterminal.com/api/v2).

export interface Candle {
    ts: number; // unix seconds, heure de clôture de la bougie
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

// État persistant minimal par token : pool résolu (évite de re-résoudre à chaque cycle) et
// dernière bougie 15m fermée déjà évaluée (idempotence + amorçage silencieux, cf. stateStore.ts).
export interface TokenState {
    mint: string;
    pool: string | null;
    lastProcessedCandleTs: number | null;
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
    signals: SignalEvaluation;
}

export interface Notifier {
    readonly name: string;
    send(alert: IndicatorAlert): Promise<void>;
}
