// Détection de la combo de signaux — fonction pure, sans I/O.
// Règle métier (confirmée par l'utilisateur) : une alerte ne part que si au moins 2 des 3
// signaux suivants se déclenchent sur la MÊME bougie 15m fermée :
//   - Bollinger (20, 2) : close qui casse la bande supérieure par le haut
//   - MACD (12, 26, 9 sur close) : histogramme qui passe de rouge (<=0) à vert (>0)
//   - RSI(2) : qui croise au-dessus de 90 (surachat extrême)
// Le signal "volume" évoqué initialement a été explicitement écarté par l'utilisateur.

import type { Candle, SignalEvaluation } from "./types.ts";
import { bollingerBands, macd, rsi } from "./indicators.ts";

export const REQUIRED_SIGNALS = 2;

function evaluateAt(
    candles: Candle[],
    bb: ReturnType<typeof bollingerBands>,
    md: ReturnType<typeof macd>,
    rs: ReturnType<typeof rsi>,
    i: number
): SignalEvaluation {
    const prevBb = bb[i - 1];
    const currBb = bb[i];
    const bbBreakout = !!(prevBb && currBb && candles[i - 1].close <= prevBb.upper && candles[i].close > currBb.upper);

    const prevMacd = md[i - 1];
    const currMacd = md[i];
    const macdFlip = !!(prevMacd && currMacd && prevMacd.histogram <= 0 && currMacd.histogram > 0);

    const prevRsi = rs[i - 1];
    const currRsi = rs[i];
    const rsiOverbought = prevRsi !== null && currRsi !== null && prevRsi <= 90 && currRsi > 90;

    const triggeredCount = [bbBreakout, macdFlip, rsiOverbought].filter(Boolean).length;

    return { bbBreakout, macdFlip, rsiOverbought, triggeredCount, qualifies: triggeredCount >= REQUIRED_SIGNALS };
}

export interface CandleEvaluation {
    candle: Candle;
    evaluation: SignalEvaluation;
}

// Évalue toutes les transitions de bougies fermées dont le timestamp est strictement postérieur
// à `sinceExclusiveTs` (null = tout évaluer, utilisé seulement pour le tout premier calcul avant
// filtrage côté appelant — l'amorçage silencieux se fait dans index.ts, pas ici).
export function evaluateCandleRange(candles: Candle[], sinceExclusiveTs: number | null): CandleEvaluation[] {
    if (candles.length < 2) return [];

    const bb = bollingerBands(candles);
    const md = macd(candles);
    const rs = rsi(candles);

    const out: CandleEvaluation[] = [];
    for (let i = 1; i < candles.length; i++) {
        if (sinceExclusiveTs !== null && candles[i].ts <= sinceExclusiveTs) continue;
        out.push({ candle: candles[i], evaluation: evaluateAt(candles, bb, md, rs, i) });
    }
    return out;
}
