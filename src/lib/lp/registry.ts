// Registre des techniques proposées dans le sélecteur de l'onglet « Choix LP ». Ajouter une
// technique (Tiago, Evil panda…) = l'implémenter dans son propre fichier puis l'inscrire ici (RG-01).

import type { Technique } from "./techniques.ts";
import { vladimirTechnique } from "./vladimir.ts";

export const TECHNIQUES: readonly Technique[] = [vladimirTechnique];

export const DEFAULT_TECHNIQUE_ID = vladimirTechnique.id;

export function techniqueById(id: string): Technique {
    return TECHNIQUES.find((t) => t.id === id) ?? vladimirTechnique;
}
