// Pools d'un CA recherché, jugés par la technique « Tiago » (PLAN.md §12.3) : frais 24 h de chaque
// pool et tendance DexScreener du token, chargée pour ce seul token. Monté une fois par token (clé
// posée par la page), d'où un état initial « chargement » sans remise à zéro dans l'effet.

import { useEffect, useState } from "react";
import { fetchTrends } from "../../lib/lp/dexscreenerTrend";
import type { TokenTrend } from "../../lib/lp/dexscreenerTrend";
import { formatChange } from "../../lib/lp/format";
import { evaluateTiago } from "../../lib/lp/tiago";
import { errorMessage } from "./hooks";
import { CaPoolsTable } from "./shared";
import type { CaResultsProps } from "./types";

type TrendState =
    | { status: "loading" }
    | { status: "ok"; trend: TokenTrend | null }
    | { status: "error"; message: string };

function change(value: number | null): string {
    return value === null ? "—" : formatChange(value);
}

export default function TiagoCaResults({ token, pools, volumes }: CaResultsProps) {
    const [state, setState] = useState<TrendState>({ status: "loading" });

    useEffect(() => {
        const controller = new AbortController();
        fetchTrends([token.address], controller.signal)
            .then((trends) => setState({ status: "ok", trend: trends.get(token.address) ?? null }))
            .catch((err) => {
                if (!controller.signal.aborted) setState({ status: "error", message: errorMessage(err) });
            });
        return () => controller.abort();
    }, [token.address]);

    const trend = state.status === "ok" ? state.trend : null;

    return (
        <>
            {state.status === "loading" && <p className="hint">Tendance DexScreener : chargement…</p>}
            {state.status === "ok" && (
                <p className="hint" title="Variations du prix en USD (DexScreener)">
                    {trend
                        ? `Tendance (USD, DexScreener) : 1 h ${change(trend.h1)} · 6 h ${change(trend.h6)} · 24 h ${change(trend.h24)}`
                        : "Tendance inconnue : token absent de DexScreener."}
                </p>
            )}
            {state.status === "error" && (
                <div className="alert alert-warn">Tendance indisponible : {state.message} — verdicts « tendance inconnue ».</div>
            )}
            <CaPoolsTable
                pools={pools}
                verdictOf={({ pool }) => (state.status === "loading" ? null : evaluateTiago(pool, trend))}
                volumes={volumes}
            />
        </>
    );
}
