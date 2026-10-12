// Technique « Tiago » (docs/specs/lp-picker/PLAN.md §12). Source : article de @tiiagoslb (24 sept.
// 2026), « comment je sélectionne mes runners » — des coins qui attirent du volume et génèrent des
// frais, en tendance haussière au moment d'entrer, pas en chute libre. Tiago ne donne aucun chiffre :
// les seuils ci-dessous sont des choix d'Enzo (2026-10-12), à ajuster à l'usage (RG-12).

import { formatChange, formatCompact } from "./format.ts";
import type { MeteoraPool, TokenGroup } from "./meteoraPools.ts";
import type { TokenTrend } from "./dexscreenerTrend.ts";
import type { PoolVerdict, Technique, VerdictLevel } from "./techniques.ts";

// RG-12 : seuils réglables ici.
export const FEES_24H_FLOOR = 1_000; // $ de frais 24 h par pool
export const TOLERANCE = 0.2; // « proche » à moins de 20 % du plancher, comme Vladimir
// Retracement 1 h toléré (« petits retracements » de Tiago) tant que le 24 h est positif ; en dessous,
// c'est la « chute libre » qu'il évite.
export const MAX_H1_PULLBACK_PCT = -10;

const RANK: Record<VerdictLevel, number> = { conforme: 0, proche: 1, "hors-regle": 2 };

function feesVerdict(pool: MeteoraPool): PoolVerdict {
    const fees = pool.fees["24h"] ?? 0;
    const floor = `$${formatCompact(FEES_24H_FLOOR)}`;
    if (fees >= FEES_24H_FLOOR) return { level: "conforme", reasons: [] };
    if (fees >= FEES_24H_FLOOR * (1 - TOLERANCE)) {
        return { level: "proche", reasons: [`frais 24 h $${formatCompact(fees)}, proche du plancher ${floor}`] };
    }
    return { level: "hors-regle", reasons: [`frais 24 h $${formatCompact(fees)} sous le plancher ${floor}`] };
}

// RG-11 : une tendance inconnue n'est jamais conforme.
function trendVerdict(trend: TokenTrend | null): PoolVerdict {
    if (!trend || trend.h24 === null) return { level: "proche", reasons: ["tendance inconnue (DexScreener)"] };
    if (trend.h24 <= 0) return { level: "hors-regle", reasons: [`24 h en baisse : ${formatChange(trend.h24)}`] };
    if (trend.h1 === null) return { level: "proche", reasons: ["variation 1 h inconnue"] };
    if (trend.h1 < MAX_H1_PULLBACK_PCT) return { level: "hors-regle", reasons: [`chute 1 h : ${formatChange(trend.h1)}`] };
    if (trend.h1 <= 0) return { level: "proche", reasons: [`petit retracement 1 h : ${formatChange(trend.h1)}`] };
    return { level: "conforme", reasons: [] };
}

// Verdict d'un pool : le pire des deux critères (frais du pool, tendance du token), avec les raisons
// des deux. `trend` = celle du token évalué, passée explicitement.
export function evaluateTiago(pool: MeteoraPool, trend: TokenTrend | null): PoolVerdict {
    const fees = feesVerdict(pool);
    const price = trendVerdict(trend);
    const level = RANK[fees.level] >= RANK[price.level] ? fees.level : price.level;
    return { level, reasons: [...fees.reasons, ...price.reasons] };
}

// Meilleur pool : le meilleur verdict, puis le plus de frais 24 h (Vladimir départage par le volume).
export function bestTiagoPool(pools: MeteoraPool[], evaluate: (pool: MeteoraPool) => PoolVerdict):
    { pool: MeteoraPool; verdict: PoolVerdict } | null {
    let best: { pool: MeteoraPool; verdict: PoolVerdict } | null = null;
    for (const pool of pools) {
        const verdict = evaluate(pool);
        if (verdict.level === "hors-regle") continue;
        if (
            !best ||
            RANK[verdict.level] < RANK[best.verdict.level] ||
            (verdict.level === best.verdict.level && pool.fees["24h"] > best.pool.fees["24h"])
        ) {
            best = { pool, verdict };
        }
    }
    return best;
}

export interface TiagoRow {
    group: TokenGroup;
    trend: TokenTrend | null;
    best: { pool: MeteoraPool; verdict: PoolVerdict } | null;
    conformes: number;
    proches: number;
}

// Lignes de la liste, triées par frais 24 h du token (§12.2). `trends` null = DexScreener
// indisponible : tous les tokens ont alors une tendance inconnue.
export function tiagoRows(groups: TokenGroup[], trends: Map<string, TokenTrend | null> | null): TiagoRow[] {
    return [...groups]
        .sort((a, b) => b.fees24h - a.fees24h)
        .map((group) => {
            const trend = trends?.get(group.token.address) ?? null;
            const evaluate = (pool: MeteoraPool) => evaluateTiago(pool, trend);
            const verdicts = group.pools.map(evaluate);
            return {
                group,
                trend,
                best: bestTiagoPool(group.pools, evaluate),
                conformes: verdicts.filter((v) => v.level === "conforme").length,
                proches: verdicts.filter((v) => v.level === "proche").length,
            };
        });
}

export const tiagoTechnique: Technique = {
    id: "tiago",
    label: "Méthode de Tiago",
    reminder:
        "Forme : 1/3 Spot + 2/3 Bid-Ask, borne basse vers −70 % (Fibonacci). Sortie : bougies 1 h, RSI(2) > 90 et prix qui touche la bande haute de Bollinger.",
};
