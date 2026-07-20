// Récupère et normalise les bougies 15 min d'un pool depuis GeckoTerminal.

import { readApiFailure, formatApiFailure } from "../src/lib/apiError.ts";
import type { Candle, GeckoTerminalOhlcvResponse } from "./types.ts";

const GECKOTERMINAL_BASE = "https://api.geckoterminal.com/api/v2";
const CANDLE_SECONDS = 15 * 60;

// Ne renvoie que des bougies FERMÉES, triées chronologiquement (ancien -> récent).
// La bougie en cours (ts + 15min > maintenant) est systématiquement exclue (anti-repainting,
// même règle que docs/specs/telegram-alerts).
export async function fetchClosedCandles(pool: string, limit: number): Promise<Candle[]> {
    const url =
        `${GECKOTERMINAL_BASE}/networks/solana/pools/${pool}/ohlcv/minute` +
        `?aggregate=15&limit=${limit}&currency=usd`;
    const res = await fetch(url, { headers: { accept: "application/json" } });

    if (!res.ok) {
        const failure = await readApiFailure("GeckoTerminal", res);
        throw new Error(formatApiFailure(failure));
    }

    const json = (await res.json()) as GeckoTerminalOhlcvResponse;
    const raw = json.data?.attributes?.ohlcv_list ?? [];

    const nowSeconds = Date.now() / 1000;
    const candles: Candle[] = raw
        .map(([ts, open, high, low, close, volume]) => ({ ts, open, high, low, close, volume }))
        .filter((c) => c.ts + CANDLE_SECONDS <= nowSeconds)
        .sort((a, b) => a.ts - b.ts);

    return candles;
}
