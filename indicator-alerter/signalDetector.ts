// Détection de la combo de signaux de SORTIE — fonction pure, sans I/O.
// Ce sont des signaux de prise de profits sur un excès haussier, pas des signaux d'entrée :
// aucune entrée n'est configurée, par décision explicite de l'utilisateur (2026-10-03).
// Exemple visuel : docs/specs/img_1.png (flèches vers 21:00).
// Règle métier (confirmée par l'utilisateur) : une alerte ne part que si au moins 2 des 3
// signaux suivants se déclenchent sur la MÊME bougie 15m — fermée ou en cours (cf. planCycle) :
//   - Bollinger (20, 2) : close qui casse la bande supérieure par le haut — sur la CLÔTURE, jamais
//     sur la mèche (high), par décision explicite de l'utilisateur (2026-10-04), même si une mèche
//     qui dépasse la bande sans clôture au-dessus ne déclenche donc pas ce signal.
//   - MACD (12, 26, 9 sur close) : histogramme qui passe de rouge (<=0) à vert (>0)
//   - RSI(2) : qui croise au-dessus de 90 (surachat extrême)
// Le signal "volume" évoqué initialement a été explicitement écarté par l'utilisateur.

import type { Candle, CandleSet, SignalEvaluation } from "./types.ts";
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

// Évalue toutes les transitions de bougies dont le timestamp est strictement postérieur à
// `sinceExclusiveTs` (null = tout évaluer). La dernière bougie peut être la bougie en cours.
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

export interface AlertCandidate extends CandleEvaluation {
    inProgress: boolean;
}

export interface CyclePlan {
    bootstrap: boolean;
    alert: AlertCandidate | null;
    lastProcessedCandleTs: number | null;
    lastAlertedCandleTs: number | null;
}

// Décide, pour un token et un cycle, s'il faut alerter et sur quelle bougie — fonction pure.
// Règles (décision utilisateur du 2026-10-09, qui remplace « bougies fermées uniquement ») :
//   - la bougie en cours est évaluée à chaque cycle, avec son prix actuel comme close ;
//   - une bougie n'alerte qu'UNE fois (lastAlertedCandleTs), qu'elle soit vue en cours ou
//     seulement à sa clôture (combo apparue entre deux cycles) ;
//   - rattrapage : si plusieurs bougies qualifient, une seule alerte, sur la plus récente ;
//   - amorçage silencieux (premier passage) : aucune alerte ; si la combo est déjà vraie sur la
//     bougie en cours, celle-ci est marquée comme déjà alertée (condition pré-existante).
// Seules les bougies fermées font avancer lastProcessedCandleTs (lu par watchlist-api).
export function planCycle(
    { closed, current }: CandleSet,
    state: { lastProcessedCandleTs: number | null; lastAlertedCandleTs: number | null }
): CyclePlan {
    const candles = current ? [...closed, current] : closed;
    // Jamais en arrière, même si GeckoTerminal sert une réponse en retard (cache).
    const newestClosedTs = closed.at(-1)?.ts ?? null;
    const lastClosedTs =
        newestClosedTs === null || state.lastProcessedCandleTs === null
            ? (newestClosedTs ?? state.lastProcessedCandleTs)
            : Math.max(newestClosedTs, state.lastProcessedCandleTs);

    if (state.lastProcessedCandleTs === null) {
        const preExisting = current !== null && evaluateCandleRange(candles, lastClosedTs).some((e) => e.evaluation.qualifies);
        return {
            bootstrap: true,
            alert: null,
            lastProcessedCandleTs: lastClosedTs,
            lastAlertedCandleTs: preExisting ? current.ts : state.lastAlertedCandleTs,
        };
    }

    const alreadyAlerted = state.lastAlertedCandleTs ?? -Infinity;
    const qualifying = evaluateCandleRange(candles, state.lastProcessedCandleTs).filter(
        (e) => e.evaluation.qualifies && e.candle.ts > alreadyAlerted
    );
    const latest = qualifying.at(-1);

    return {
        bootstrap: false,
        alert: latest ? { ...latest, inProgress: latest.candle === current } : null,
        lastProcessedCandleTs: lastClosedTs,
        lastAlertedCandleTs: latest ? latest.candle.ts : state.lastAlertedCandleTs,
    };
}
