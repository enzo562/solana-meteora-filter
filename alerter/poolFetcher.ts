import { readApiFailure, formatApiFailure } from "../src/lib/apiError.ts";
import type { MeteoraPool, PoolsResponse } from "./types.ts";

// Même endpoint que src/pages/PoolsPage.tsx : les 50 pools DLMM les plus récentes.
const METEORA_POOLS_URL =
    "https://dlmm.datapi.meteora.ag/pools?page=1&page_size=50&sort_by=pool_created_at:desc";

export async function fetchPools(): Promise<MeteoraPool[]> {
    const res = await fetch(METEORA_POOLS_URL, { headers: { accept: "application/json" } });

    if (!res.ok) {
        const failure = await readApiFailure("Meteora", res);
        throw new Error(formatApiFailure(failure));
    }

    const json = (await res.json()) as PoolsResponse;
    return json.data;
}
