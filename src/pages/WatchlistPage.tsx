import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { isValidSolanaAddress } from "../lib/solanaAddress";
import { describeStatus, inactiveMinutes, readWatchlistError } from "../lib/watchlist";
import type { WatchlistItem, WatchlistResponse } from "../lib/watchlist";

// Gestion de la watchlist des alertes de sortie (indicator-alerter). La page parle au service local
// watchlist-api (Spring Boot) via le proxy Vite /api ; le service édite indicator-alerter/watchlist.json
// et lit l'état de l'alerteur. Spec : docs/specs/watchlist-web/PLAN.md.

const POLL_INTERVAL_MS = 30_000;
const MAX_LABEL_LENGTH = 40;
const API = "/api/watchlist";

function shortAddr(addr: string): string {
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function WatchlistPage() {
    const [data, setData] = useState<WatchlistResponse | null>(null);
    const [fetchedAt, setFetchedAt] = useState<number | null>(null);
    const [unreachable, setUnreachable] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [mint, setMint] = useState("");
    const [label, setLabel] = useState("");
    const [formError, setFormError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const [editing, setEditing] = useState<{ mint: string; label: string } | null>(null);
    const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
    const [copied, setCopied] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const res = await fetch(API);
            if (!res.ok) {
                const err = await readWatchlistError(res);
                setUnreachable(err.kind === "unreachable");
                setError(err.kind === "api" ? err.message : null);
                return;
            }
            const json = (await res.json()) as WatchlistResponse;
            setData(json);
            setFetchedAt(Date.now());
            setUnreachable(false);
            setError(null);
        } catch {
            setUnreachable(true);
        }
    }, []);

    // Premier chargement dans un rappel (comme le polling) plutôt que dans le corps de l'effet :
    // react-hooks/set-state-in-effect interdit un setState synchrone pendant l'effet.
    useEffect(() => {
        const first = setTimeout(load, 0);
        const interval = setInterval(load, POLL_INTERVAL_MS);
        return () => {
            clearTimeout(first);
            clearInterval(interval);
        };
    }, [load]);

    // Envoie une modification puis recharge la liste. Renvoie le message d'erreur métier, ou null.
    async function mutate(request: () => Promise<Response>): Promise<string | null> {
        setBusy(true);
        try {
            const res = await request();
            if (!res.ok) {
                const err = await readWatchlistError(res);
                if (err.kind === "unreachable") {
                    setUnreachable(true);
                    return "Service watchlist injoignable.";
                }
                return err.message;
            }
            await load();
            return null;
        } catch {
            setUnreachable(true);
            return "Service watchlist injoignable.";
        } finally {
            setBusy(false);
        }
    }

    async function handleAdd(e: FormEvent) {
        e.preventDefault();
        const ca = mint.trim();
        if (!isValidSolanaAddress(ca)) {
            setFormError("Adresse Solana invalide.");
            return;
        }
        const message = await mutate(() =>
            fetch(API, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ mint: ca, label: label.trim() || null }),
            }),
        );
        setFormError(message);
        if (message === null) {
            setMint("");
            setLabel("");
        }
    }

    async function handleRename() {
        if (!editing) return;
        const message = await mutate(() =>
            fetch(`${API}/${editing.mint}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ label: editing.label.trim() || null }),
            }),
        );
        setError(message);
        if (message === null) setEditing(null);
    }

    async function handleRemove(target: string) {
        const message = await mutate(() => fetch(`${API}/${target}`, { method: "DELETE" }));
        setError(message);
        setConfirmRemove(null);
    }

    async function copy(text: string) {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(text);
            setTimeout(() => setCopied((c) => (c === text ? null : c)), 1500);
        } catch {
            // presse-papiers indisponible : rien à faire
        }
    }

    const alerter = data?.alerter;
    const items: WatchlistItem[] = data?.items ?? [];

    return (
        <div className="page">
            <header className="page-header">
                <div>
                    <h1>Watchlist · alertes de sortie</h1>
                    <p className="subtitle">
                        Tokens surveillés par l'alerteur (signal de sortie 15 min) · rafraîchissement auto toutes les{" "}
                        {POLL_INTERVAL_MS / 1000}s
                    </p>
                </div>
                <div className="header-actions">
                    <button className="btn" onClick={load} disabled={busy}>
                        Rafraîchir
                    </button>
                </div>
            </header>

            {unreachable && (
                <div className="alert alert-error">
                    Service watchlist injoignable — lance <code>npm run watchlist-api</code>.
                </div>
            )}
            {error && <div className="alert alert-error">{error}</div>}
            {alerter && !alerter.stateReadable && (
                <div className="alert alert-warn">
                    État de l'alerteur momentanément illisible — statuts indisponibles, nouvel essai au prochain
                    rafraîchissement.
                </div>
            )}
            {alerter && alerter.stateReadable && !alerter.active && items.length > 0 && (
                <div className="alert alert-warn">
                    {alerter.lastActivityMs === null || fetchedAt === null
                        ? "Aucune activité de l'alerteur pour l'instant — lance npm run indicator-alerter."
                        : `Alerteur inactif ou en erreur depuis ${inactiveMinutes(alerter.lastActivityMs, fetchedAt)} min — voir ses logs ; les changements seront pris en compte à son prochain cycle réussi.`}
                </div>
            )}

            <form className="scan-form" onSubmit={handleAdd}>
                <input
                    className="scan-input"
                    placeholder="Adresse du token (CA)"
                    value={mint}
                    onChange={(e) => {
                        setMint(e.target.value);
                        setFormError(null);
                    }}
                    spellCheck={false}
                    autoComplete="off"
                />
                <input
                    className="scan-input"
                    placeholder="Label (optionnel)"
                    value={label}
                    maxLength={MAX_LABEL_LENGTH}
                    onChange={(e) => setLabel(e.target.value)}
                />
                <button className="btn" type="submit" disabled={busy || unreachable}>
                    Ajouter
                </button>
            </form>
            {formError && <div className="alert alert-error">{formError}</div>}
            <p className="hint">Pris en compte au prochain cycle de l'alerteur (≤ 2 min).</p>

            <div className="table-wrap">
                <div className="table-scroll">
                    <table className="data-table">
                        <thead>
                        <tr>
                            <th>Label</th>
                            <th>CA</th>
                            <th>Statut</th>
                            <th>Liens</th>
                            <th>Actions</th>
                        </tr>
                        </thead>
                        <tbody>
                        {items.map((item) => (
                            <tr key={item.mint}>
                                <td className="sym">
                                    {editing?.mint === item.mint ? (
                                        <input
                                            className="scan-input"
                                            value={editing.label}
                                            maxLength={MAX_LABEL_LENGTH}
                                            autoFocus
                                            onChange={(e) => setEditing({ mint: item.mint, label: e.target.value })}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") handleRename();
                                                if (e.key === "Escape") setEditing(null);
                                            }}
                                        />
                                    ) : (
                                        item.label ?? <span className="hint-inline">{shortAddr(item.mint)}</span>
                                    )}
                                </td>
                                <td className="mono">
                                    {shortAddr(item.mint)}{" "}
                                    <button className="copy-btn" type="button" onClick={() => copy(item.mint)}>
                                        {copied === item.mint ? "Copié" : "Copier"}
                                    </button>
                                </td>
                                <td>{describeStatus(item.status, item.lastProcessedCandleTs)}</td>
                                <td>
                                    {item.pool ? (
                                        <span className="link-row">
                                            <a className="link-btn" href={`https://dexscreener.com/solana/${item.pool}`} target="_blank" rel="noreferrer">
                                                DexScreener ↗
                                            </a>
                                            <a className="link-btn" href={`https://www.geckoterminal.com/solana/pools/${item.pool}`} target="_blank" rel="noreferrer">
                                                GeckoTerminal ↗
                                            </a>
                                        </span>
                                    ) : (
                                        "—"
                                    )}
                                </td>
                                <td>
                                    {editing?.mint === item.mint ? (
                                        <>
                                            <button className="btn" type="button" onClick={handleRename} disabled={busy}>
                                                Enregistrer
                                            </button>{" "}
                                            <button className="btn" type="button" onClick={() => setEditing(null)}>
                                                Annuler
                                            </button>
                                        </>
                                    ) : confirmRemove === item.mint ? (
                                        <>
                                            <button className="remove-btn" type="button" onClick={() => handleRemove(item.mint)} disabled={busy}>
                                                Confirmer ?
                                            </button>{" "}
                                            <button className="btn" type="button" onClick={() => setConfirmRemove(null)}>
                                                Annuler
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button
                                                className="btn"
                                                type="button"
                                                onClick={() => {
                                                    setConfirmRemove(null);
                                                    setEditing({ mint: item.mint, label: item.label ?? "" });
                                                }}
                                            >
                                                Renommer
                                            </button>{" "}
                                            <button
                                                className="remove-btn"
                                                type="button"
                                                onClick={() => {
                                                    setEditing(null);
                                                    setConfirmRemove(item.mint);
                                                }}
                                            >
                                                Retirer
                                            </button>
                                        </>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {data && items.length === 0 && (
                            <tr>
                                <td className="table-empty" colSpan={5}>
                                    Watchlist vide — ajoute un premier token ci-dessus.
                                </td>
                            </tr>
                        )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
