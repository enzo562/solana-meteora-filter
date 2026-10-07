// Interface commune des techniques de choix LP (docs/specs/lp-picker/PLAN.md §5). RG-01 : une
// technique = une liste ; une technique ne lit jamais le verdict d'une autre.

import type { MeteoraPool, PoolToken } from "./meteoraPools.ts";

export type VerdictLevel = "conforme" | "proche" | "hors-regle";

export interface PoolVerdict {
    level: VerdictLevel;
    reasons: string[]; // vide si conforme
}

export interface Technique {
    id: string;
    label: string;
    reminder: string; // rappel affiché sous le sélecteur
    // `token` = le token évalué (celui de la ligne ou le CA recherché), jamais déduit de l'ordre
    // token_x / token_y : dans une paire « USDC-TOKEN », token_x est l'USDC.
    evaluate(pool: MeteoraPool, token: PoolToken): PoolVerdict;
}
