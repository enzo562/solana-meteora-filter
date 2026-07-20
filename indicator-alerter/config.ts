import { fileURLToPath } from "node:url";

export type AlertChannel = "discord" | "telegram";

export interface IndicatorAlerterConfig {
    channels: AlertChannel[];
    discordWebhookUrl: string | null;
    telegramBotToken: string | null;
    telegramChatId: string | null;
    scanIntervalMs: number;
    candleLimit: number;
    watchlistFilePath: string;
    stateFilePath: string;
}

const DEFAULT_WATCHLIST_FILE = fileURLToPath(new URL("./watchlist.json", import.meta.url));
const DEFAULT_STATE_FILE = fileURLToPath(new URL("./.state/state.json", import.meta.url));

function parseChannels(raw: string | undefined): AlertChannel[] {
    if (!raw || raw.trim() === "") return [];
    return raw
        .split(",")
        .map((c) => c.trim().toLowerCase())
        .filter((c): c is AlertChannel => c === "discord" || c === "telegram");
}

function parseNumber(raw: string | undefined, fallback: number, name: string): number {
    if (raw === undefined || raw.trim() === "") return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n)) {
        throw new Error(`Configuration invalide : ${name}="${raw}" n'est pas un nombre.`);
    }
    return n;
}

// Réutilise volontairement ALERT_CHANNELS / DISCORD_WEBHOOK_URL / TELEGRAM_BOT_TOKEN /
// TELEGRAM_CHAT_ID (mêmes variables que alerter/config.ts) : les deux services notifient sur les
// mêmes canaux. Les autres paramètres sont préfixés INDICATOR_ pour ne jamais entrer en conflit
// avec les variables propres à alerter/ (ex. SCAN_INTERVAL_MS a un sens différent là-bas).
export function loadConfig(env: NodeJS.ProcessEnv = process.env): IndicatorAlerterConfig {
    const channels = parseChannels(env.ALERT_CHANNELS);

    if (channels.length === 0) {
        console.warn(
            "[config] Aucun canal actif (ALERT_CHANNELS vide ou absent) — le service tourne mais ne notifiera nulle part."
        );
    }

    const discordWebhookUrl = env.DISCORD_WEBHOOK_URL?.trim() || null;
    if (channels.includes("discord") && !discordWebhookUrl) {
        throw new Error("ALERT_CHANNELS contient 'discord' mais DISCORD_WEBHOOK_URL est manquant.");
    }

    const telegramBotToken = env.TELEGRAM_BOT_TOKEN?.trim() || null;
    const telegramChatId = env.TELEGRAM_CHAT_ID?.trim() || null;
    if (channels.includes("telegram") && (!telegramBotToken || !telegramChatId)) {
        throw new Error(
            "ALERT_CHANNELS contient 'telegram' mais TELEGRAM_BOT_TOKEN et/ou TELEGRAM_CHAT_ID sont manquants."
        );
    }

    const scanIntervalMs = parseNumber(env.INDICATOR_SCAN_INTERVAL_MS, 120_000, "INDICATOR_SCAN_INTERVAL_MS");
    if (scanIntervalMs <= 0) throw new Error("INDICATOR_SCAN_INTERVAL_MS doit être positif.");

    // 300 (~3 jours de bougies 15m) laisse une marge confortable au-delà du minimum strict
    // (~40) : l'EMA du MACD est amorcée par une SMA dont le biais ne devient négligeable
    // qu'après plusieurs multiples de la période lente (26) de bougies supplémentaires.
    const candleLimit = parseNumber(env.INDICATOR_CANDLE_LIMIT, 300, "INDICATOR_CANDLE_LIMIT");
    if (candleLimit < 50) throw new Error("INDICATOR_CANDLE_LIMIT doit être >= 50 (warm-up MACD/BB).");

    const watchlistFilePath = env.INDICATOR_WATCHLIST_PATH?.trim() || DEFAULT_WATCHLIST_FILE;
    const stateFilePath = env.INDICATOR_STATE_FILE_PATH?.trim() || DEFAULT_STATE_FILE;

    return {
        channels,
        discordWebhookUrl,
        telegramBotToken,
        telegramChatId,
        scanIntervalMs,
        candleLimit,
        watchlistFilePath,
        stateFilePath,
    };
}
