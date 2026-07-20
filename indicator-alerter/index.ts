import { loadConfig, type IndicatorAlerterConfig } from "./config.ts";
import { readWatchlist } from "./watchlist.ts";
import { readState, writeState, nextTokenState } from "./stateStore.ts";
import { resolveMostLiquidPool } from "./poolResolver.ts";
import { fetchClosedCandles } from "./ohlcvClient.ts";
import { evaluateCandleRange } from "./signalDetector.ts";
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

    let candles;
    try {
        candles = await fetchClosedCandles(pool, config.candleLimit);
    } catch (err) {
        // La liquidité a pu migrer vers un nouveau pool (l'ancien devient 404/vide) : on oublie
        // le pool mis en cache pour forcer une re-résolution au prochain cycle.
        logger.error("indicator-alerter.candles.fetch_failed", { mint: entry.mint, pool, error: String(err) });
        return nextTokenState(existing, entry.mint, { pool: null });
    }
    if (candles.length < MIN_CANDLES_REQUIRED) {
        logger.info("indicator-alerter.candles.insufficient", {
            mint: entry.mint,
            pool,
            available: candles.length,
            required: MIN_CANDLES_REQUIRED,
        });
        return nextTokenState(existing, entry.mint, { pool });
    }

    const lastCandle = candles[candles.length - 1];
    const lastProcessedCandleTs = existing?.lastProcessedCandleTs ?? null;

    // Amorçage silencieux : premier passage sur ce token, on enregistre l'état sans alerter,
    // sinon on alerterait immédiatement sur une condition déjà en place avant l'ajout à la
    // watchlist (même règle anti-« big bang » que alerter/diffDetector.ts).
    if (lastProcessedCandleTs === null) {
        logger.info("indicator-alerter.bootstrap", { mint: entry.mint, pool, lastCandleTs: lastCandle.ts });
        return nextTokenState(existing, entry.mint, { pool, lastProcessedCandleTs: lastCandle.ts });
    }

    const evaluations = evaluateCandleRange(candles, lastProcessedCandleTs);
    if (evaluations.length === 0) {
        return nextTokenState(existing, entry.mint, { pool });
    }

    // Rattrapage : si plusieurs bougies se sont fermées depuis le dernier cycle, on n'alerte
    // qu'une fois, sur la plus récente bougie qualifiante (évite un backlog d'alertes en rafale).
    const qualifying = evaluations.filter((e) => e.evaluation.qualifies);
    if (qualifying.length > 0) {
        const latest = qualifying[qualifying.length - 1];
        const alert: IndicatorAlert = {
            mint: entry.mint,
            label: displayLabel(entry),
            pool,
            price: latest.candle.close,
            candleTs: latest.candle.ts,
            signals: latest.evaluation,
        };
        logger.info("indicator-alerter.signal.qualified", {
            mint: entry.mint,
            candleTs: latest.candle.ts,
            triggeredCount: latest.evaluation.triggeredCount,
        });
        await notifyAll(notifiers, alert);
    }

    return nextTokenState(existing, entry.mint, { pool, lastProcessedCandleTs: lastCandle.ts });
}

async function runCycle(config: IndicatorAlerterConfig, notifiers: Notifier[]): Promise<void> {
    const watchlist = await readWatchlist(config.watchlistFilePath);
    if (watchlist.length === 0) {
        logger.info("indicator-alerter.cycle.empty_watchlist");
        return;
    }

    const state = await readState(config.stateFilePath);

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
