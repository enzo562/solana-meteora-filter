import { loadConfig, type AlerterConfig } from "./config.ts";
import { fetchPools } from "./poolFetcher.ts";
import { readSeenAddresses, writeSeenAddresses } from "./stateStore.ts";
import { detectNewPools } from "./diffDetector.ts";
import { discordNotifier, telegramNotifier, toPoolAlert, type Notifier } from "./notifier.ts";
import { logger } from "./logger.ts";
import type { MeteoraPool } from "./types.ts";

function buildNotifiers(config: AlerterConfig): Notifier[] {
    const notifiers: Notifier[] = [];
    if (config.channels.includes("discord") && config.discordWebhookUrl) {
        notifiers.push(discordNotifier(config.discordWebhookUrl));
    }
    if (config.channels.includes("telegram") && config.telegramBotToken && config.telegramChatId) {
        notifiers.push(telegramNotifier(config.telegramBotToken, config.telegramChatId));
    }
    return notifiers;
}

// RG-03 / RG-04 : une pool filtrée est tout de même marquée "vue" (jamais re-signalée),
// elle ne déclenche simplement pas d'envoi.
function passesFilters(pool: MeteoraPool, config: AlerterConfig): boolean {
    if (config.excludeBlacklisted && pool.is_blacklisted) return false;
    return pool.tvl >= config.minTvlAlert;
}

async function notifyAll(notifiers: Notifier[], pool: MeteoraPool): Promise<void> {
    const alert = toPoolAlert(pool);
    const results = await Promise.allSettled(notifiers.map((n) => n.send(alert)));

    results.forEach((result, i) => {
        const notifier = notifiers[i];
        if (result.status === "rejected") {
            logger.error("alerter.notify.failed", {
                channel: notifier.name,
                address: pool.address,
                error: String(result.reason),
            });
        } else {
            logger.info("alerter.notify.sent", { channel: notifier.name, address: pool.address, name: pool.name });
        }
    });
}

async function runCycle(config: AlerterConfig, notifiers: Notifier[]): Promise<void> {
    let pools: MeteoraPool[];
    try {
        pools = await fetchPools();
    } catch (err) {
        // Panne API : on ne touche pas à l'état, le cycle suivant retente (US-05).
        logger.error("alerter.cycle.fetch_failed", { error: String(err) });
        return;
    }

    const seen = await readSeenAddresses(config.stateFilePath);
    const { isBootstrap, freshPools } = detectNewPools(pools, seen);

    if (isBootstrap) {
        for (const p of pools) seen.add(p.address);
        await writeSeenAddresses(config.stateFilePath, seen, config.seenPoolsMax);
        logger.info("alerter.cycle.bootstrap", { poolsRegistered: pools.length });
        return;
    }

    if (freshPools.length === 0) {
        logger.info("alerter.cycle.no_new_pools", { poolsScanned: pools.length });
        return;
    }

    logger.info("alerter.cycle.new_pools_detected", { count: freshPools.length });

    for (const pool of freshPools) {
        seen.add(pool.address);
        if (passesFilters(pool, config)) {
            await notifyAll(notifiers, pool);
        } else {
            logger.info("alerter.cycle.pool_filtered", { address: pool.address, name: pool.name });
        }
    }

    await writeSeenAddresses(config.stateFilePath, seen, config.seenPoolsMax);
}

async function main(): Promise<void> {
    const config = loadConfig();
    const notifiers = buildNotifiers(config);

    logger.info("alerter.start", {
        channels: config.channels,
        scanIntervalMs: config.scanIntervalMs,
        minTvlAlert: config.minTvlAlert,
        excludeBlacklisted: config.excludeBlacklisted,
        stateFilePath: config.stateFilePath,
    });

    const tick = () => {
        runCycle(config, notifiers).catch((err) =>
            logger.error("alerter.cycle.unexpected_error", { error: String(err) })
        );
    };

    tick();
    setInterval(tick, config.scanIntervalMs);
}

main();
