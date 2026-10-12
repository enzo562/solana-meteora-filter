// Récupère et normalise les bougies 15 min d'un pool depuis GeckoTerminal.

import { readApiFailure, formatApiFailure } from "../src/lib/apiError.ts";
import type { Candle, CandleSet, GeckoTerminalOhlcvResponse } from "./types.ts";

const GECKOTERMINAL_BASE = "https://api.geckoterminal.com/api/v2";
const CANDLE_SECONDS = 15 * 60;

// Sépare les bougies FERMÉES, triées chronologiquement (ancien -> récent), de la bougie en cours
// (ts + 15min > maintenant), que GeckoTerminal renvoie et met à jour en continu.
// Historique : jusqu'au 2026-10-09 la bougie en cours était systématiquement écartée
// (anti-repainting, même règle que docs/specs/telegram-alerts). L'utilisateur a choisi d'alerter
// en cours de bougie pour gagner en réactivité, en acceptant qu'un signal disparaisse avant la
// clôture — cf. planCycle dans signalDetector.ts.
export function splitCandles(raw: [number, number, number, number, number, number][], nowSeconds: number): CandleSet {
    const candles: Candle[] = raw
        .map(([ts, open, high, low, close, volume]) => ({ ts, open, high, low, close, volume }))
        .sort((a, b) => a.ts - b.ts);

    const closed = candles.filter((c) => c.ts + CANDLE_SECONDS <= nowSeconds);
    const open = candles.filter((c) => c.ts + CANDLE_SECONDS > nowSeconds);
    return { closed, current: open.at(-1) ?? null };
}

// Renvoie null quand GeckoTerminal répond 404 (pool inconnu ou disparu, ex. liquidité migrée) :
// l'appelant oublie alors le pool pour le re-résoudre. Toute autre erreur (429 en tête) lève sans
// que le pool soit oublié, sinon la re-résolution coûterait un appel de plus en plein rate limit.
export async function fetchCandles(pool: string, limit: number): Promise<CandleSet | null> {
    const url =
        `${GECKOTERMINAL_BASE}/networks/solana/pools/${pool}/ohlcv/minute` +
        `?aggregate=15&limit=${limit}&currency=usd`;
    const res = await fetch(url, { headers: { accept: "application/json" } });

    if (res.status === 404) return null;

    if (!res.ok) {
        const failure = await readApiFailure("GeckoTerminal", res);
        throw new Error(formatApiFailure(failure));
    }

    const json = (await res.json()) as GeckoTerminalOhlcvResponse;
    return splitCandles(json.data?.attributes?.ohlcv_list ?? [], Date.now() / 1000);
}
