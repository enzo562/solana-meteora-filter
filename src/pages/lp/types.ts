// Props communes des vues d'une technique (PLAN.md §5, RG-10) : chaque technique fournit sa liste
// automatique et l'affichage des pools d'un CA recherché ; la page ne fait que les monter.

import type { PoolOfToken, PoolToken } from "../../lib/lp/meteoraPools";
import type { MinuteVolumeQueue } from "../../lib/lp/minuteVolume";

export interface ListProps {
    volumes: MinuteVolumeQueue; // file GeckoTerminal unique de la page (RG-09)
}

export interface CaResultsProps {
    token: PoolToken;
    pools: PoolOfToken[]; // tous les pools du CA (RG-06), paires non-SOL comprises
    volumes: MinuteVolumeQueue;
}
