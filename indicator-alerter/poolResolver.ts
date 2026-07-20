// Résout le pool Solana le plus liquide d'un mint via GeckoTerminal (l'OHLCV est par pool, pas
// par mint — cf. docs/specs/telegram-alerts/SPECIFICATION-TECHNIQUE.md §4).

import { readApiFailure, formatApiFailure } from "../src/lib/apiError.ts";
import type { GeckoTerminalPoolsResponse } from "./types.ts";

const GECKOTERMINAL_BASE = "https://api.geckoterminal.com/api/v2";

export async function resolveMostLiquidPool(mint: string): Promise<string | null> {
    const url = `${GECKOTERMINAL_BASE}/networks/solana/tokens/${mint}/pools`;
    const res = await fetch(url, { headers: { accept: "application/json" } });

    if (!res.ok) {
        const failure = await readApiFailure("GeckoTerminal", res);
        throw new Error(formatApiFailure(failure));
    }

    const json = (await res.json()) as GeckoTerminalPoolsResponse;
    const pools = json.data ?? [];
    if (pools.length === 0) return null;

    // Le plus liquide en priorité (reserve_in_usd = TVL) ; à égalité (rare), on départage par
    // volume 24h.
    const score = (p: GeckoTerminalPoolsResponse["data"][number]): [number, number] => [
        Number(p.attributes.reserve_in_usd ?? 0),
        Number(p.attributes.volume_usd?.h24 ?? 0),
    ];

    let best = pools[0];
    let [bestReserve, bestVolume] = score(best);
    for (const p of pools.slice(1)) {
        const [reserve, volume] = score(p);
        if (reserve > bestReserve || (reserve === bestReserve && volume > bestVolume)) {
            best = p;
            bestReserve = reserve;
            bestVolume = volume;
        }
    }

    return best.attributes.address;
}
