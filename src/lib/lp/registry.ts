// Registre des techniques proposées dans le sélecteur de l'onglet « Choix LP ». Ajouter une
// technique (Evil panda…) = sa logique dans son propre fichier, une ligne ici, ses vues dans
// src/pages/lp/views.ts (RG-01, RG-10).

import type { Technique } from "./techniques.ts";
import { tiagoTechnique } from "./tiago.ts";
import { vladimirTechnique } from "./vladimir.ts";

export const TECHNIQUES: readonly Technique[] = [vladimirTechnique, tiagoTechnique];

export const DEFAULT_TECHNIQUE_ID = vladimirTechnique.id;

export function techniqueById(id: string): Technique {
    return TECHNIQUES.find((t) => t.id === id) ?? vladimirTechnique;
}
