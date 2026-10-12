// Types communs des techniques de choix LP (docs/specs/lp-picker/PLAN.md §5). RG-01 : une
// technique = une liste ; une technique ne lit jamais le verdict d'une autre. RG-10 (v4) : chaque
// technique est un module autonome — sa logique dans src/lib/lp/<id>.ts, sa liste et ses résultats
// de recherche dans src/pages/lp/ ; il n'y a donc plus d'`evaluate` commun ici.

export type TechniqueId = "vladimir" | "tiago";

export type VerdictLevel = "conforme" | "proche" | "hors-regle";

export interface PoolVerdict {
    level: VerdictLevel;
    reasons: string[]; // vide si conforme
}

export interface Technique {
    id: TechniqueId;
    label: string;
    reminder: string; // rappel affiché sous le sélecteur
}
