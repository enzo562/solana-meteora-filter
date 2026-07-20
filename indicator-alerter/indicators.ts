// Indicateurs techniques — fonctions pures, sans I/O, testables indépendamment.
// Chaque fonction prend un tableau de bougies triées chronologiquement (ancien -> récent) et
// renvoie un tableau de même longueur, aligné index à index, avec `null` pendant le warm-up.

import type { Candle } from "./types.ts";

export interface BollingerPoint {
    middle: number;
    upper: number;
    lower: number;
}

export interface MacdPoint {
    macd: number;
    signal: number;
    histogram: number;
}

function sma(values: number[], period: number): (number | null)[] {
    const out: (number | null)[] = new Array(values.length).fill(null);
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
        sum += values[i];
        if (i >= period) sum -= values[i - period];
        if (i >= period - 1) out[i] = sum / period;
    }
    return out;
}

// Écart-type de population (cohérent avec ta.stdev de TradingView utilisé par défaut sur les BB).
function stddev(values: number[], period: number, means: (number | null)[]): (number | null)[] {
    const out: (number | null)[] = new Array(values.length).fill(null);
    for (let i = period - 1; i < values.length; i++) {
        const mean = means[i];
        if (mean === null) continue;
        let sumSq = 0;
        for (let j = i - period + 1; j <= i; j++) {
            const diff = values[j] - mean;
            sumSq += diff * diff;
        }
        out[i] = Math.sqrt(sumSq / period);
    }
    return out;
}

// EMA classique : amorcée par une SMA sur les `period` premières valeurs, puis récursive.
function ema(values: number[], period: number): (number | null)[] {
    const out: (number | null)[] = new Array(values.length).fill(null);
    const alpha = 2 / (period + 1);
    let prev: number | null = null;
    for (let i = 0; i < values.length; i++) {
        if (prev === null) {
            if (i >= period - 1) {
                let sum = 0;
                for (let j = i - period + 1; j <= i; j++) sum += values[j];
                prev = sum / period;
                out[i] = prev;
            }
            continue;
        }
        prev = values[i] * alpha + prev * (1 - alpha);
        out[i] = prev;
    }
    return out;
}

// Bandes de Bollinger : période 20, multiplicateur 2 par défaut (standard).
export function bollingerBands(candles: Candle[], period = 20, mult = 2): (BollingerPoint | null)[] {
    const closes = candles.map((c) => c.close);
    const middle = sma(closes, period);
    const sd = stddev(closes, period, middle);
    return closes.map((_, i) => {
        const m = middle[i];
        const s = sd[i];
        if (m === null || s === null) return null;
        return { middle: m, upper: m + mult * s, lower: m - mult * s };
    });
}

// MACD standard 12/26/9 sur le close.
export function macd(candles: Candle[], fast = 12, slow = 26, signalPeriod = 9): (MacdPoint | null)[] {
    const closes = candles.map((c) => c.close);
    const emaFast = ema(closes, fast);
    const emaSlow = ema(closes, slow);

    const macdLine: (number | null)[] = closes.map((_, i) => {
        const f = emaFast[i];
        const s = emaSlow[i];
        return f !== null && s !== null ? f - s : null;
    });

    // La ligne de signal est l'EMA de la ligne MACD, calculée seulement sur les valeurs non-null.
    const macdValuesOnly = macdLine.filter((v): v is number => v !== null);
    const signalOnly = ema(macdValuesOnly, signalPeriod);

    const out: (MacdPoint | null)[] = new Array(closes.length).fill(null);
    let signalIdx = 0;
    for (let i = 0; i < closes.length; i++) {
        const m = macdLine[i];
        if (m === null) continue;
        const s = signalOnly[signalIdx];
        signalIdx++;
        if (s === null) continue;
        out[i] = { macd: m, signal: s, histogram: m - s };
    }
    return out;
}

// RSI avec lissage de Wilder (RMA), cohérent avec l'implémentation standard TradingView
// quelle que soit la période (y compris les périodes courtes comme 2).
export function rsi(candles: Candle[], period = 2): (number | null)[] {
    const closes = candles.map((c) => c.close);
    const out: (number | null)[] = new Array(closes.length).fill(null);
    if (closes.length < period + 1) return out;

    const gains: number[] = [0];
    const losses: number[] = [0];
    for (let i = 1; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        gains.push(Math.max(diff, 0));
        losses.push(Math.max(-diff, 0));
    }

    let avgGain = 0;
    let avgLoss = 0;
    for (let i = 1; i <= period; i++) {
        avgGain += gains[i];
        avgLoss += losses[i];
    }
    avgGain /= period;
    avgLoss /= period;

    const rsiAt = (g: number, l: number): number => {
        if (l === 0) return g === 0 ? 50 : 100;
        const rs = g / l;
        return 100 - 100 / (1 + rs);
    };
    out[period] = rsiAt(avgGain, avgLoss);

    for (let i = period + 1; i < closes.length; i++) {
        avgGain = (avgGain * (period - 1) + gains[i]) / period;
        avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
        out[i] = rsiAt(avgGain, avgLoss);
    }

    return out;
}
