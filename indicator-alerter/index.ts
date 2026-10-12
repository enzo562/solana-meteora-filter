import { exceedsGeckoBudget, loadConfig, GECKO_CALLS_PER_MIN_BUDGET, type IndicatorAlerterConfig } from "./config.ts";
import { readWatchlist } from "./watchlist.ts";
import { readState, writeState, nextTokenState, purgeRemovedTokens } from "./stateStore.ts";
import { resolveMostLiquidPool } from "./poolResolver.ts";
import { fetchCandles } from "./ohlcvClient.ts";
import { planCycle } from "./signalDetector.ts";
import { discordNotifier, telegramNotifier } from "./notifier.ts";
import { logger } from "./logger.ts";
import type { IndicatorAlert, Notifier, TokenState, WatchlistEntry } from "./types.ts";

// Marge de warm-up minimale pour que MACD(12,26,9)/BB(20)/RSI(2) produisent des valeurs stables.
const MIN_CANDLES_REQUIRED = 40;

function buildNotifiers(config: IndicatorAlerterConfig): Notifier[] {
    const notifiers: Notifier[] = [];
    if (config.channels.includes("discord") && config.discordWebhookUrl) {
        notifiers.push(discordNotifier(config.discordWebhookUrl));
    }
    if (config.channels.includes("telegram") && config.telegramBotToken && config.telegramChatId) {
        notifiers.push(telegramNotifier(config.telegramBotToken, config.telegramChatId));
    }
    return notifiers;
}

function displayLabel(entry: WatchlistEntry): string {
    if (entry.label) return entry.label;
    return `${entry.mint.slice(0, 6)}…${entry.mint.slice(-4)}`;
}

async function notifyAll(notifiers: Notifier[], alert: IndicatorAlert): Promise<void> {
    const results = await Promise.allSettled(notifiers.map((n) => n.send(alert)));
    results.forEach((result, i) => {
        const notifier = notifiers[i];
        if (result.status === "rejected") {
            logger.error("indicator-alerter.notify.failed", {
                channel: notifier.name,
                mint: alert.mint,
                error: String(result.reason),
            });
        } else {
            logger.info("indicator-alerter.notify.sent", { channel: notifier.name, mint: alert.mint });
        }
    });
}

// Traite un token de la watchlist de façon isolée : une panne ici ne doit jamais interrompre le
// traitement des autres tokens du cycle (US-05 du spec sœur, même principe). Ne renvoie QUE la
// nouvelle entrée d'état de ce mint (jamais la map entière) : plusieurs tokens sont traités en
// parallèle (cf. runCycle), donc chaque résultat doit se fusionner indépendamment dans la map
// finale plutôt que d'écraser les mises à jour des autres tokens du même cycle.
async function processEntry(
    entry: WatchlistEntry,
    config: IndicatorAlerterConfig,
    existing: TokenState | undefined,
    notifiers: Notifier[]
): Promise<TokenState> {
    let pool = existing?.pool ?? null;

    if (!pool) {
        pool = await resolveMostLiquidPool(entry.mint);
        if (!pool) {
            logger.warn("indicator-alerter.pool.not_found", { mint: entry.mint });
            return nextTokenState(existing, entry.mint, {});
        }
        logger.info("indicator-alerter.pool.resolved", { mint: entry.mint, pool });
    }

    let candleSet;
    try {
        candleSet = await fetchCandles(pool, config.candleLimit);
    } catch (err) {
        // Panne passagère (429 en tête) : on garde le pool, une re-résolution coûterait un appel
        // GeckoTerminal de plus en plein rate limit.
        logger.error("indicator-alerter.candles.fetch_failed", { mint: entry.mint, pool, error: String(err) });
        return nextTokenState(existing, entry.mint, { pool });
    }
    if (candleSet === null) {
        // 404 : la liquidité a pu migrer vers un nouveau pool. On oublie le pool mis en cache pour
        // forcer une re-résolution au prochain cycle.
        logger.warn("indicator-alerter.candles.pool_gone", { mint: entry.mint, pool });
        return nextTokenState(existing, entry.mint, { pool: null });
    }
    if (candleSet.closed.length < MIN_CANDLES_REQUIRED) {
        logger.info("indicator-alerter.candles.insufficient", {
            mint: entry.mint,
            pool,
            available: candleSet.closed.length,
            required: MIN_CANDLES_REQUIRED,
        });
        return nextTokenState(existing, entry.mint, { pool });
    }

    // Bougie en cours incluse, une seule alerte par bougie, amorçage silencieux, rattrapage :
    // toutes les règles sont dans planCycle (signalDetector.ts).
    const plan = planCycle(candleSet, {
        lastProcessedCandleTs: existing?.lastProcessedCandleTs ?? null,
        lastAlertedCandleTs: existing?.lastAlertedCandleTs ?? null,
    });
    const nextState = nextTokenState(existing, entry.mint, {
        pool,
        lastProcessedCandleTs: plan.lastProcessedCandleTs,
        lastAlertedCandleTs: plan.lastAlertedCandleTs,
    });

    if (plan.bootstrap) {
        logger.info("indicator-alerter.bootstrap", {
            mint: entry.mint,
            pool,
            lastCandleTs: plan.lastProcessedCandleTs,
            preExistingSignalTs: plan.lastAlertedCandleTs,
        });
        return nextState;
    }

    if (plan.alert) {
        const { candle, evaluation, inProgress } = plan.alert;
        const alert: IndicatorAlert = {
            mint: entry.mint,
            label: displayLabel(entry),
            pool,
            price: candle.close,
            candleTs: candle.ts,
            inProgress,
            signals: evaluation,
        };
        logger.info("indicator-alerter.signal.qualified", {
            mint: entry.mint,
            candleTs: candle.ts,
            inProgress,
            triggeredCount: evaluation.triggeredCount,
        });
        await notifyAll(notifiers, alert);
    }

    return nextState;
}

// Ne logue qu'au franchissement du seuil (dans un sens ou dans l'autre), pas à chaque cycle : la
// watchlist est relue à chaque cycle, donc la charge peut changer sans redémarrage.
let overGeckoBudget = false;

function checkGeckoBudget(tokenCount: number, scanIntervalMs: number): void {
    const over = exceedsGeckoBudget(tokenCount, scanIntervalMs);
    if (over === overGeckoBudget) return;
    overGeckoBudget = over;
    const callsPerMin = Math.round((tokenCount * 60_000) / scanIntervalMs);
    if (over) {
        logger.warn("indicator-alerter.gecko_budget.exceeded", {
            tokens: tokenCount,
            scanIntervalMs,
            callsPerMin,
            budgetPerMin: GECKO_CALLS_PER_MIN_BUDGET,
            hint: "Risque de 429 si l'onglet /lp est ouvert : augmenter INDICATOR_SCAN_INTERVAL_MS.",
        });
    } else {
        logger.info("indicator-alerter.gecko_budget.ok", { tokens: tokenCount, scanIntervalMs, callsPerMin });
    }
}

async function runCycle(config: IndicatorAlerterConfig, notifiers: Notifier[]): Promise<void> {
    // Une watchlist au JSON invalide lève ici, AVANT la purge : le cycle est sauté sans toucher à
    // l'état, pour qu'une faute de frappe ne fasse jamais oublier l'état de tous les tokens.
    const watchlist = await readWatchlist(config.watchlistFilePath);
    const state = await readState(config.stateFilePath);

    const purged = purgeRemovedTokens(state, watchlist);
    if (purged.length > 0) {
        logger.info("indicator-alerter.state.purged", { mints: purged });
    }

    if (watchlist.length === 0) {
        if (purged.length > 0) await writeState(config.stateFilePath, state);
        logger.info("indicator-alerter.cycle.empty_watchlist");
        return;
    }

    checkGeckoBudget(watchlist.length, config.scanIntervalMs);

    const results = await Promise.allSettled(
        watchlist.map((entry) => processEntry(entry, config, state[entry.mint], notifiers))
    );

    results.forEach((result, i) => {
        const entry = watchlist[i];
        if (result.status === "rejected") {
            logger.error("indicator-alerter.cycle.token_failed", { mint: entry.mint, error: String(result.reason) });
            return;
        }
        state[entry.mint] = result.value;
    });

    await writeState(config.stateFilePath, state);
}

async function main(): Promise<void> {
    const config = loadConfig();
    const notifiers = buildNotifiers(config);

    logger.info("indicator-alerter.start", {
        channels: config.channels,
        scanIntervalMs: config.scanIntervalMs,
        candleLimit: config.candleLimit,
        watchlistFilePath: config.watchlistFilePath,
        stateFilePath: config.stateFilePath,
    });

    const tick = () => {
        runCycle(config, notifiers).catch((err) =>
            logger.error("indicator-alerter.cycle.unexpected_error", { error: String(err) })
        );
    };

    tick();
    setInterval(tick, config.scanIntervalMs);
}

main();
