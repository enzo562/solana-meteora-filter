// Technique « Règles de Vladimir » (docs/specs/lp-picker/PLAN.md §3) : le bon pool dépend de la
// market cap du token. Source : post 4/ de @VladimirKovacs (28 sept. 2026) — « sous les 1M de
// marketcap : base fees de 2 % minimum, bin step plus larges genre 125–200 ; au-dessus de 1M :
// 1 %, 0,8 %, etc., parfois bin step 50 ou même la fameuse 20/0,2 ».

import { formatPct } from "./format.ts";
import type { MeteoraPool, PoolToken } from "./meteoraPools.ts";
import type { PoolVerdict, Technique, VerdictLevel } from "./techniques.ts";

// RG-04 : bornes et tolérance réglables ici.
export const MARKET_CAP_THRESHOLD = 1_000_000;
// Tolérance (bornes souples, décision d'Enzo du 2026-10-06) : « proche » = à moins de 20 % d'une borne.
// Elle définit aussi la zone frontière 0,8M–1,2M où les deux règles sont acceptées.
export const TOLERANCE = 0.2;

interface Rule {
    name: string;
    minFee: number;
    maxFee: number;
    minBinStep: number;
    maxBinStep: number;
}

const SMALL_CAP: Rule = { name: "< 1M", minFee: 2, maxFee: Infinity, minBinStep: 125, maxBinStep: 200 };
const LARGE_CAP: Rule = { name: "≥ 1M", minFee: 0.2, maxFee: 1, minBinStep: 20, maxBinStep: 50 };

type Fit = "exact" | "near" | "out";

// Marge d'arrondi : 0,2 × (1 − 0,2) vaut 0,16000000000000003 en virgule flottante, ce qui ferait
// tomber un pool à 0,16 % pile hors de la borne souple.
const EPSILON = 1e-9;

function fit(value: number, min: number, max: number): Fit {
    if (value >= min - EPSILON && value <= max + EPSILON) return "exact";
    if (value >= min * (1 - TOLERANCE) - EPSILON && value <= max * (1 + TOLERANCE) + EPSILON) return "near";
    return "out";
}

function feeReason(fee: number, rule: Rule, f: Fit): string {
    const where = f === "near" ? "proche" : "hors";
    if (rule.maxFee === Infinity) {
        return `frais ${formatPct(fee)} ${where === "proche" ? "proche du" : "sous le"} minimum ${formatPct(rule.minFee)} (règle ${rule.name})`;
    }
    return `frais ${formatPct(fee)} ${where} de ${String(rule.minFee).replace(".", ",")}–${formatPct(rule.maxFee)} (règle ${rule.name})`;
}

function binReason(binStep: number, rule: Rule, f: Fit): string {
    return `bin step ${binStep} ${f === "near" ? "proche" : "hors"} de ${rule.minBinStep}–${rule.maxBinStep} (règle ${rule.name})`;
}

function applyRule(pool: MeteoraPool, rule: Rule): PoolVerdict {
    const fee = pool.pool_config.base_fee_pct;
    const binStep = pool.pool_config.bin_step;
    const feeFit = fit(fee, rule.minFee, rule.maxFee);
    const binFit = fit(binStep, rule.minBinStep, rule.maxBinStep);

    const reasons: string[] = [];
    if (feeFit !== "exact") reasons.push(feeReason(fee, rule, feeFit));
    if (binFit !== "exact") reasons.push(binReason(binStep, rule, binFit));

    const level: VerdictLevel =
        feeFit === "exact" && binFit === "exact" ? "conforme" : feeFit !== "out" && binFit !== "out" ? "proche" : "hors-regle";
    return { level, reasons };
}

const RANK: Record<VerdictLevel, number> = { conforme: 0, proche: 1, "hors-regle": 2 };

// `marketCap` = celle du token évalué, passée explicitement (cf. vladimirVerdict).
export function evaluateVladimir(pool: MeteoraPool, marketCap: number): PoolVerdict {
    if (!(marketCap > 0)) return { level: "hors-regle", reasons: ["market cap inconnue"] };

    const own = marketCap < MARKET_CAP_THRESHOLD ? SMALL_CAP : LARGE_CAP;
    const inFrontier =
        marketCap >= MARKET_CAP_THRESHOLD * (1 - TOLERANCE) && marketCap <= MARKET_CAP_THRESHOLD * (1 + TOLERANCE);
    const verdict = applyRule(pool, own);
    if (!inFrontier) return verdict;

    // Zone frontière : l'autre règle est aussi acceptée ; la meilleure l'emporte (à égalité, celle
    // de la tranche du token).
    const other = applyRule(pool, own === SMALL_CAP ? LARGE_CAP : SMALL_CAP);
    return RANK[other.level] < RANK[verdict.level] ? other : verdict;
}

// Meilleur pool d'un token : le conforme au plus fort volume 24 h, sinon le proche au plus fort volume.
export function bestPool(pools: MeteoraPool[], evaluate: (pool: MeteoraPool) => PoolVerdict):
    { pool: MeteoraPool; verdict: PoolVerdict } | null {
    let best: { pool: MeteoraPool; verdict: PoolVerdict } | null = null;
    for (const pool of pools) {
        const verdict = evaluate(pool);
        if (verdict.level === "hors-regle") continue;
        if (
            !best ||
            RANK[verdict.level] < RANK[best.verdict.level] ||
            (verdict.level === best.verdict.level && pool.volume["24h"] > best.pool.volume["24h"])
        ) {
            best = { pool, verdict };
        }
    }
    return best;
}

// Verdict d'un pool pour le token évalué (celui de la ligne ou le CA recherché), jamais déduit de
// l'ordre token_x / token_y : dans une paire « USDC-TOKEN », token_x est l'USDC.
export function vladimirVerdict(pool: MeteoraPool, token: PoolToken): PoolVerdict {
    return evaluateVladimir(pool, token.market_cap);
}

export const vladimirTechnique: Technique = {
    id: "vladimir",
    label: "Règles de Vladimir",
    reminder: "Forme : Spot pour un coup rapide, Bid-Ask pour un token établi (memecoin qui a fait ses preuves).",
};
