import type { MeteoraPool } from "./types.ts";

export interface PoolAlert {
    address: string;
    name: string;
    createdAtMs: number;
    tvl: number;
    binStep: number;
    baseFeePct: number;
}

export interface Notifier {
    readonly name: string;
    send(alert: PoolAlert): Promise<void>;
}

export function toPoolAlert(pool: MeteoraPool): PoolAlert {
    return {
        address: pool.address,
        name: pool.name,
        createdAtMs: pool.created_at,
        tvl: pool.tvl,
        binStep: pool.pool_config.bin_step,
        baseFeePct: pool.pool_config.base_fee_pct,
    };
}

// Même logique que formatAge() dans src/pages/PoolsPage.tsx.
function formatAge(createdAtMs: number): string {
    const diffSeconds = (Date.now() - createdAtMs) / 1000;
    if (diffSeconds < 60) return `${Math.floor(diffSeconds)}s`;
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}min`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h`;
    return `${Math.floor(diffSeconds / 86400)}j`;
}

function meteoraUrl(address: string): string {
    return `https://app.meteora.ag/dlmm/${address}`;
}

function formatUsd(n: number): string {
    return `${n.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} $`;
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function discordNotifier(webhookUrl: string): Notifier {
    return {
        name: "discord",
        async send(alert) {
            const body = {
                embeds: [
                    {
                        title: `🆕 ${alert.name}`,
                        url: meteoraUrl(alert.address),
                        color: 3066993,
                        fields: [
                            { name: "Bin step", value: String(alert.binStep), inline: true },
                            { name: "Frais", value: `${alert.baseFeePct}%`, inline: true },
                            { name: "TVL", value: formatUsd(alert.tvl), inline: true },
                            { name: "Âge", value: formatAge(alert.createdAtMs), inline: true },
                            { name: "Adresse", value: alert.address, inline: false },
                        ],
                        timestamp: new Date(alert.createdAtMs).toISOString(),
                    },
                ],
            };

            const res = await fetch(webhookUrl, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                const raw = await res.text();
                throw new Error(`Discord webhook a échoué (HTTP ${res.status}) : ${raw}`);
            }
        },
    };
}

export function telegramNotifier(botToken: string, chatId: string): Notifier {
    return {
        name: "telegram",
        async send(alert) {
            const text = [
                `🆕 <b>NOUVELLE POOL METEORA</b> · ${escapeHtml(alert.name)}`,
                "",
                `Bin step : ${alert.binStep}`,
                `Frais    : ${alert.baseFeePct}%`,
                `TVL      : ${formatUsd(alert.tvl)}`,
                `Âge      : ${formatAge(alert.createdAtMs)}`,
                "",
                `Adresse : <code>${alert.address}</code>`,
                `<a href="${meteoraUrl(alert.address)}">Voir sur Meteora</a>`,
            ].join("\n");

            const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    chat_id: chatId,
                    text,
                    parse_mode: "HTML",
                    disable_web_page_preview: true,
                }),
            });

            if (!res.ok) {
                const raw = await res.text();
                throw new Error(`Telegram sendMessage a échoué (HTTP ${res.status}) : ${raw}`);
            }
        },
    };
}
