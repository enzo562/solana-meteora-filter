// Pools d'un CA recherché, jugés par la règle de Vladimir (PLAN.md §3.1) sur la market cap du token
// recherché.

import { vladimirVerdict } from "../../lib/lp/vladimir";
import { CaPoolsTable } from "./shared";
import type { CaResultsProps } from "./types";

export default function VladimirCaResults({ pools, volumes }: CaResultsProps) {
    return <CaPoolsTable pools={pools} verdictOf={({ pool, token }) => vladimirVerdict(pool, token)} volumes={volumes} />;
}
