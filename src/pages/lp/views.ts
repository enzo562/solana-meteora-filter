// Vues de chaque technique (PLAN.md §5, RG-10). Le type Record impose une entrée par TechniqueId :
// ajouter une technique au registre sans ses vues ne compile pas.

import type { ComponentType } from "react";
import type { TechniqueId } from "../../lib/lp/techniques";
import type { CaResultsProps, ListProps } from "./types";
import VladimirList from "./VladimirList";
import VladimirCaResults from "./VladimirCaResults";
import TiagoList from "./TiagoList";
import TiagoCaResults from "./TiagoCaResults";

export interface TechniqueViews {
    List: ComponentType<ListProps>;
    CaResults: ComponentType<CaResultsProps>;
}

export const TECHNIQUE_VIEWS: Record<TechniqueId, TechniqueViews> = {
    vladimir: { List: VladimirList, CaResults: VladimirCaResults },
    tiago: { List: TiagoList, CaResults: TiagoCaResults },
};
