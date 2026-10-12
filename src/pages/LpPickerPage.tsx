import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { isValidSolanaAddress } from "../lib/solanaAddress";
import { fetchPoolsByQuery, poolsForMint } from "../lib/lp/meteoraPools";
import type { PoolOfToken, PoolToken } from "../lib/lp/meteoraPools";
import { formatCompact } from "../lib/lp/format";
import { DEFAULT_TECHNIQUE_ID, TECHNIQUES, techniqueById } from "../lib/lp/registry";
import { createBrowserMinuteVolumeQueue } from "../lib/lp/minuteVolume";
import { errorMessage } from "./lp/hooks";
import { SecurityLinks } from "./lp/shared";
import { TECHNIQUE_VIEWS } from "./lp/views";

// Choix du pool Meteora DLMM où fournir de la liquidité, selon une technique choisie dans le
// sélecteur (une technique = une liste). La page ne garde que le commun — sélecteur, recherche par
// CA, file GeckoTerminal ; chaque technique fournit sa liste et ses résultats (RG-10, src/pages/lp/).
// Spec : docs/specs/lp-picker/PLAN.md.

type CaState =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "ok"; token: PoolToken; pools: PoolOfToken[] }
    | { status: "empty" }
    | { status: "error"; message: string };

export default function LpPickerPage() {
    const [techniqueId, setTechniqueId] = useState<string>(DEFAULT_TECHNIQUE_ID);
    const technique = techniqueById(techniqueId);
    const { List, CaResults } = TECHNIQUE_VIEWS[technique.id];

    // Une seule file GeckoTerminal pour toute la page (RG-09). Pas de dispose au démontage : le mode
    // strict de React démonte/remonte les effets en dev ; on se contente de se désabonner.
    const [volumes] = useState(createBrowserMinuteVolumeQueue);
    const [, setVolumesVersion] = useState(0);
    useEffect(() => volumes.subscribe(() => setVolumesVersion((v) => v + 1)), [volumes]);

    // --- Recherche par CA ---
    const [ca, setCa] = useState("");
    const [caState, setCaState] = useState<CaState>({ status: "idle" });
    const caAbort = useRef<AbortController | null>(null);

    async function handleSearch(e: FormEvent) {
        e.preventDefault();
        const mint = ca.trim();
        if (!isValidSolanaAddress(mint)) {
            setCaState({ status: "error", message: "Adresse Solana invalide." });
            return;
        }
        caAbort.current?.abort();
        const controller = new AbortController();
        caAbort.current = controller;
        setCaState({ status: "loading" });
        try {
            const pools = poolsForMint(await fetchPoolsByQuery(mint, controller.signal), mint);
            if (controller.signal.aborted) return;
            setCaState(pools.length === 0 ? { status: "empty" } : { status: "ok", token: pools[0].token, pools });
        } catch (err) {
            if (controller.signal.aborted) return;
            setCaState({ status: "error", message: errorMessage(err) });
        }
    }

    useEffect(() => {
        if (caState.status === "ok") caState.pools.forEach(({ pool }) => volumes.request(pool.address, 0));
    }, [caState, volumes]);

    return (
        <div className="page">
            <header className="page-header">
                <div>
                    <h1>Choix LP · pools Meteora DLMM</h1>
                    <p className="subtitle">Une technique = une liste. Données Meteora, aucun ordre passé depuis cette page.</p>
                </div>
            </header>

            <div className="scan-form">
                <label className="hint-inline" htmlFor="technique">
                    Technique
                </label>
                <select id="technique" className="scan-input" value={technique.id} onChange={(e) => setTechniqueId(e.target.value)}>
                    {TECHNIQUES.map((t) => (
                        <option key={t.id} value={t.id}>
                            {t.label}
                        </option>
                    ))}
                </select>
            </div>
            <p className="hint">{technique.reminder}</p>

            <h2>Recherche par CA</h2>
            <form className="scan-form" onSubmit={handleSearch}>
                <input
                    className="scan-input"
                    placeholder="Adresse du token (CA)"
                    value={ca}
                    onChange={(e) => setCa(e.target.value)}
                    spellCheck={false}
                    autoComplete="off"
                />
                <button className="btn" type="submit" disabled={caState.status === "loading"}>
                    {caState.status === "loading" ? "Analyse…" : "Analyser"}
                </button>
            </form>
            {caState.status === "error" && <div className="alert alert-error">{caState.message}</div>}
            {caState.status === "empty" && <div className="alert alert-warn">Aucun pool DLMM Meteora pour ce token.</div>}
            {caState.status === "ok" && (
                <div className="table-wrap">
                    <p className="hint">
                        {caState.token.symbol} · market cap ${formatCompact(caState.token.market_cap)} · {caState.pools.length} pool(s){" "}
                        <SecurityLinks mint={caState.token.address} />
                    </p>
                    <CaResults key={`${technique.id}:${caState.token.address}`} token={caState.token} pools={caState.pools} volumes={volumes} />
                </div>
            )}

            <h2>Liste automatique</h2>
            <List key={technique.id} volumes={volumes} />
        </div>
    );
}
