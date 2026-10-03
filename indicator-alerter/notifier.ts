import type { IndicatorAlert, Notifier } from "./types.ts";

function dexscreenerUrl(pool: string): string {
    return `https://dexscreener.com/solana/${pool}`;
}

function geckoterminalUrl(pool: string): string {
    return `https://www.geckoterminal.com/solana/pools/${pool}`;
}

function formatPrice(price: number): string {
    // Les shitcoins ont souvent des prix à beaucoup de décimales : on affiche assez de chiffres
    // significatifs pour rester lisible sans tronquer à 0.00.
    const decimals = price < 0.01 ? 8 : price < 1 ? 6 : 4;
    return `${price.toLocaleString("fr-FR", { maximumFractionDigits: decimals })} $`;
}

function formatCandleTime(candleTs: number): string {
    return new Date(candleTs * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

// Ces alertes sont des signaux de SORTIE (prise de profits), jamais d'entrée — cf. signalDetector.ts.
const EXIT_REASON = "Prise de profits — surchauffe haussière";

function signalLabels(signals: IndicatorAlert["signals"]): string[] {
    const labels: string[] = [];
    if (signals.bbBreakout) labels.push("Bollinger cassée par le haut (20, 2)");
    if (signals.macdFlip) labels.push("MACD rouge → vert (12, 26, 9)");
    if (signals.rsiOverbought) labels.push("RSI(2) > 90 (surachat)");
    return labels;
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function discordNotifier(webhookUrl: string): Notifier {
    return {
        name: "discord",
        async send(alert) {
            const labels = signalLabels(alert.signals);
            const body = {
                embeds: [
                    {
                        title: `🔴 SIGNAL DE SORTIE · ${alert.label}`,
                        description: EXIT_REASON,
                        url: dexscreenerUrl(alert.pool),
                        color: 15158332,
                        fields: [
                            { name: "Prix", value: formatPrice(alert.price), inline: true },
                            {
                                name: "Signaux",
                                value: `${alert.signals.triggeredCount}/3`,
                                inline: true,
                            },
                            { name: "Bougie 15m", value: formatCandleTime(alert.candleTs), inline: true },
                            { name: "Déclencheurs", value: labels.map((l) => `• ${l}`).join("\n"), inline: false },
                            { name: "Mint", value: alert.mint, inline: false },
                            {
                                name: "Liens",
                                value: `[DexScreener](${dexscreenerUrl(alert.pool)}) · [GeckoTerminal](${geckoterminalUrl(alert.pool)})`,
                                inline: false,
                            },
                        ],
                        timestamp: new Date(alert.candleTs * 1000).toISOString(),
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
            const labels = signalLabels(alert.signals);
            const text = [
                `🔴 <b>SIGNAL DE SORTIE</b> · ${escapeHtml(alert.label)} (${alert.signals.triggeredCount}/3)`,
                escapeHtml(EXIT_REASON),
                "",
                ...labels.map((l) => `✅ ${escapeHtml(l)}`),
                "",
                `Prix      : ${formatPrice(alert.price)}`,
                `Bougie 15m : ${formatCandleTime(alert.candleTs)}`,
                "",
                `Mint : <code>${alert.mint}</code>`,
                `<a href="${dexscreenerUrl(alert.pool)}">DexScreener</a> · <a href="${geckoterminalUrl(alert.pool)}">GeckoTerminal</a>`,
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
