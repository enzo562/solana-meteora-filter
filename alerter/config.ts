import { fileURLToPath } from "node:url";

export type AlertChannel = "discord" | "telegram";

export interface AlerterConfig {
    channels: AlertChannel[];
    discordWebhookUrl: string | null;
    telegramBotToken: string | null;
    telegramChatId: string | null;
    scanIntervalMs: number;
    minTvlAlert: number;
    excludeBlacklisted: boolean;
    seenPoolsMax: number;
    stateFilePath: string;
}

const DEFAULT_STATE_FILE = fileURLToPath(new URL("./.state/seen-pools.json", import.meta.url));

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

// Lit et valide la configuration depuis les variables d'environnement.
// Refuse de démarrer (throw) si un canal actif n'a pas ses secrets requis (US-04 / RG-05).
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AlerterConfig {
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

    const scanIntervalMs = parseNumber(env.SCAN_INTERVAL_MS, 60_000, "SCAN_INTERVAL_MS");
    if (scanIntervalMs <= 0) throw new Error("SCAN_INTERVAL_MS doit être positif.");

    const minTvlAlert = parseNumber(env.MIN_TVL_ALERT, 0, "MIN_TVL_ALERT");
    if (minTvlAlert < 0) throw new Error("MIN_TVL_ALERT ne peut pas être négatif.");

    const seenPoolsMax = parseNumber(env.SEEN_POOLS_MAX, 5_000, "SEEN_POOLS_MAX");
    if (seenPoolsMax <= 0) throw new Error("SEEN_POOLS_MAX doit être positif.");

    const excludeBlacklisted = (env.EXCLUDE_BLACKLISTED ?? "true").trim().toLowerCase() !== "false";
    const stateFilePath = env.STATE_FILE_PATH?.trim() || DEFAULT_STATE_FILE;

    return {
        channels,
        discordWebhookUrl,
        telegramBotToken,
        telegramChatId,
        scanIntervalMs,
        minTvlAlert,
        excludeBlacklisted,
        seenPoolsMax,
        stateFilePath,
    };
}
