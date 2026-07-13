// Interprète une réponse d'API en échec pour indiquer QUELLE API est en cause
// et POURQUOI (quota, authentification, rate limit, etc.).

export interface ApiFailure {
    api: string;      // nom lisible de l'API concernée
    reason: string;   // explication en clair de la cause
    status: number;   // code HTTP
    raw: string;      // corps brut renvoyé par l'API (pour debug)
}

// Détecte la cause à partir du code HTTP et du corps de la réponse.
function explain(status: number, body: string): string {
    const lower = body.toLowerCase();

    if (lower.includes("compute units")) {
        return "Quota de compute units épuisé — cette API n'a plus de crédits de calcul disponibles (limite du plan atteinte).";
    }
    if (status === 401 || status === 403 || lower.includes("api key") || lower.includes("unauthorized")) {
        return "Clé API invalide ou non autorisée.";
    }
    if (status === 429 || lower.includes("rate limit") || lower.includes("too many requests")) {
        return "Trop de requêtes — limite de débit (rate limit) atteinte, réessayez plus tard.";
    }
    if (status >= 500) {
        return "Erreur côté serveur de l'API — indisponibilité temporaire.";
    }
    return "Requête refusée par l'API.";
}

// À appeler dans un catch. `res` est la Response fetch en échec (res.ok === false).
export async function readApiFailure(api: string, res: Response): Promise<ApiFailure> {
    const raw = await res.text();
    return {
        api,
        status: res.status,
        raw,
        reason: explain(res.status, raw),
    };
}

// Message prêt à afficher : « [API] indisponible — raison (HTTP xxx) ».
export function formatApiFailure(f: ApiFailure): string {
    return `API ${f.api} indisponible — ${f.reason} (HTTP ${f.status})`;
}
