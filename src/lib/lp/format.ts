// Formatage des nombres de l'onglet « Choix LP » (affichage en français).

function decimal(value: number, digits: number): string {
    return value.toFixed(digits).replace(/\.0+$/, "").replace(".", ",");
}

// 317_412 → "317k", 2_291_709 → "2,3M", 2_870_200_000 → "2,9 Md".
export function formatCompact(value: number): string {
    const abs = Math.abs(value);
    if (abs >= 1e9) return `${decimal(value / 1e9, 1)} Md`;
    if (abs >= 1e6) return `${decimal(value / 1e6, 1)}M`;
    if (abs >= 1e3) return `${Math.round(value / 1e3)}k`;
    return String(Math.round(value));
}

// Adresse abrégée pour l'affichage : « DoVAVz…pump ».
export function shortAddr(addr: string): string {
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// Variation de prix signée à une décimale (DexScreener priceChange : -18.09 → "-18,1 %").
export function formatChange(value: number): string {
    const sign = value > 0 ? "+" : "";
    return `${sign}${decimal(value, 1)} %`;
}

// Pourcentage tel que fourni par Meteora (base_fee_pct : 0.3 = 0,3 %).
export function formatPct(value: number): string {
    return `${String(value).replace(".", ",")} %`;
}
