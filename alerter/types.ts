// Types alignés sur la réponse de l'API Meteora DLMM (mêmes formes que src/pages/PoolsPage.tsx).

export interface TokenMetrics {
    address: string;
    name: string;
    symbol: string;
    decimals: number;
    is_verified: boolean;
    holders: number;
    freeze_authority_disabled: boolean;
    total_supply: number;
    price: number;
    market_cap: number;
}

export interface TimeWindowData {
    "30m": number;
    "1h": number;
    "2h": number;
    "4h": number;
    "12h": number;
    "24h": number;
}

export interface PoolConfig {
    bin_step: number;
    base_fee_pct: number;
    max_fee_pct: number;
    protocol_fee_pct: number;
    collect_fee_mode: number;
}

export interface MeteoraPool {
    address: string;
    name: string;
    token_x: TokenMetrics;
    token_y: TokenMetrics;
    created_at: number; // Unix timestamp (millisecondes)
    tvl: number;
    current_price: number;
    apr: number;
    apy: number;
    dynamic_fee_pct: number;
    pool_config: PoolConfig;
    volume: TimeWindowData;
    fees: TimeWindowData;
    is_blacklisted: boolean;
    tags: string[];
}

export interface PoolsResponse {
    total: number;
    pages: number;
    current_page: number;
    page_size: number;
    data: MeteoraPool[];
}
