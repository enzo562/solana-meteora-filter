# Spécification technique — Alertes « Nouvelle pool Meteora »

> Complément technique de `SPECIFICATION-FONCTIONNELLE.md`. Décisions d'architecture, contrats de
> données, gestion des secrets et des erreurs.
> Version 1 — 2026-07-17, mise à jour 2026-07-18 après implémentation (`alerter/`, PR #1) : voir
> §3 et §6, qui documentaient initialement des options non encore tranchées — l'hébergement réel
> retenu diverge de la recommandation d'origine (Cloudflare Worker).

---

## 1. Point de départ : ce que l'archi actuelle NE permet pas

`src/pages/PoolsPage.tsx` fait déjà 90 % du travail de **détection** :
- il appelle `GET https://dlmm.datapi.meteora.ag/pools?page=1&page_size=50&sort_by=pool_created_at:desc` ;
- il compare les `address` reçues à un `Set` en mémoire (`seenAddresses`, un `useRef`) pour
  déterminer quelles pools sont « nouvelles depuis le dernier fetch » ;
- il ne notifie nulle part : le seul effet visible est un badge `NEW` dans le tableau.

Deux limites structurelles empêchent de transformer ça en alerte poussée sans nouveau composant :
1. **La SPA ne tourne que si l'onglet est ouvert.** `seenAddresses` vit en mémoire du navigateur ;
   fermer l'onglet remet tout à zéro et arrête toute détection.
2. **Un bot Discord/Telegram exige un secret côté serveur** (webhook URL Discord ou token de bot
   Telegram) — inutilisable en `VITE_*` (embarqué publiquement dans le bundle client).

→ **On introduit un composant serveur/serverless dédié**, découplé de la SPA, qui **réutilise la
même API et le même principe de diff** que `PoolsPage.tsx`, mais avec un état persistant côté
serveur au lieu d'un `useRef` client. La SPA reste inchangée.

---

## 2. Vue d'ensemble de l'architecture

```mermaid
flowchart LR
    subgraph Externe[API tierce]
      MET[Meteora DLMM API<br/>dlmm.datapi.meteora.ag/pools]
    end

    subgraph Alerter[Service d'alertes - NOUVEAU, côté serveur]
      CRON[Ordonnanceur<br/>cron / interval]
      PIPE[Pipeline: fetch pools -> diff vs seenAddresses -> filtre -> notifier]
      STATE[(État persistant<br/>adresses déjà vues)]
      NOTIF[Notifier abstrait]
    end

    DISC[[Discord webhook]]
    TG[[Telegram Bot API]]
    SPA[SPA React existante<br/>PoolsPage.tsx inchangée]

    CRON --> PIPE
    MET --> PIPE
    PIPE <--> STATE
    PIPE --> NOTIF
    NOTIF --> DISC
    NOTIF --> TG
    MET -. déjà consommé par .- SPA
```

Le service est **additif** : aucun fichier `src/` existant n'est modifié.

---

## 3. Hébergement

> **Décision réelle (2026-07-18, tranche Q1)** : ni mutualisation Cloudflare ni Worker séparé.
> Première itération = **script Node local** (`alerter/`, lancé via `npm run alerter`), retenu
> pour démarrer le développement sans provisionner de compte Cloudflare. Les deux options
> serverless ci-dessous restent documentées comme **évolution possible**, pas comme travail
> restant à faire dans l'immédiat.

| Option | Description | Avantage | Inconvénient |
|--------|-------------|----------|---------------|
| **0. Script Node local** ✅ **retenu pour cette itération** | `alerter/index.ts`, boucle `setInterval` lancée manuellement (`npm run alerter`), état dans un fichier JSON local (`alerter/.state/seen-pools.json`) | Zéro compte/dépendance externe à provisionner, itération immédiate, aucune nouvelle dépendance npm (exécution TS native Node 24 + `--env-file`) | **Ne notifie que pendant que le process tourne** sur une machine allumée — pas de haute dispo, pas de garantie de continuité si l'ordi s'éteint/veille (cf. NFR §10) |
| **1. Mutualiser** avec un futur Worker Cloudflare du projet Supertrend (`telegram-alerts/`) | Un second Cron Trigger sur le même Worker, une nouvelle clé KV dédiée (`seenPools:*`) | Pas de nouvelle enveloppe à provisionner si Supertrend est déployé un jour, un seul lieu de secrets | Couple le cycle de vie des deux fonctionnalités ; Supertrend n'est pas non plus implémenté à ce jour |
| **2. Worker séparé** | Cloudflare Worker + Cron Trigger + KV dédiés à cette seule alerte | Isolation complète, dispo continue, granularité de cron fine | Compte Cloudflare + `wrangler` à mettre en place, migration de l'état JSON → KV |

**Migration vers l'option 1 ou 2** recommandée si le besoin de disponibilité 24/7 devient réel
(le script Node ne survit pas à l'extinction de la machine qui l'exécute) — sinon alternative de
repli plus légère : cron GitHub Actions + état dans un Gist, granularité ~5 min (suffisante : RG-01
= 1 min est un objectif, la latence cible O2 reste 2 min).

---

## 4. Source de données — API Meteora DLMM

Réutilisation directe de l'appel existant :

```
GET https://dlmm.datapi.meteora.ag/pools?page=1&page_size=50&sort_by=pool_created_at:desc
Accept: application/json
```

Aucune clé API requise (cohérent avec `PoolsPage.tsx`). Les types de réponse peuvent être
**copiés tels quels** depuis `src/pages/PoolsPage.tsx` (`MeteoraPool`, `PoolsResponse`,
`TokenMetrics`, `TimeWindowData`, `PoolConfig`) — aucune divergence de contrat attendue puisque
c'est le même endpoint.

Champs utiles à l'alerte : `address`, `name`, `created_at` (unix ms), `tvl`, `pool_config.bin_step`,
`pool_config.base_fee_pct`, `is_blacklisted`.

> **Rate limit non documenté publiquement.** Un seul appel par cycle (contrairement au projet
> Supertrend qui fait un appel OHLCV par token candidat) → charge négligeable. Pas de stratégie de
> throttling nécessaire au MVP ; prévoir un backoff simple en cas de 429/5xx (RG-08 côté fonctionnel).

---

## 5. Composants / modules à créer

| Module | Responsabilité |
|--------|----------------|
| `scheduler` | Déclenche un cycle à intervalle régulier (Cron Trigger) |
| `config` | Charge et valide la configuration (canaux actifs, secrets, seuils, intervalle) ; refuse de démarrer si incohérente |
| `poolFetcher` | Appelle l'API Meteora, réutilise les types de `PoolsPage.tsx` |
| `diffDetector` | Compare les adresses reçues à l'état persistant → produit la liste des pools inédites |
| `stateStore` | Lit/écrit l'état persistant (adresses vues, avec éviction FIFO au-delà de RG-09) |
| `notifier` | Interface abstraite `send(alert): Promise<void>` ; implémentations `discordNotifier` et `telegramNotifier` |
| `apiFailure` | Réutiliser `src/lib/apiError.ts` (déjà framework-agnostique) pour qualifier les échecs Meteora |
| `logger` | Logs structurés par cycle |

### Interface `notifier`
```ts
interface PoolAlert {
  address: string;
  name: string;
  createdAtMs: number;
  tvl: number;
  binStep: number;
  baseFeePct: number;
}

interface Notifier {
  send(alert: PoolAlert): Promise<void>;
}
```
`discordNotifier` et `telegramNotifier` implémentent chacun cette interface ; le pipeline appelle
tous les notifiers actifs (`ALERT_CHANNELS`) via `Promise.allSettled` pour qu'un canal en panne
n'empêche pas l'envoi sur l'autre (US-05).

---

## 6. Modèle de données (état persistant)

### Entité `SeenPools` — implémentée en fichier JSON local (`alerter/stateStore.ts`)
Un seul fichier (`alerter/.state/seen-pools.json`, gitignored) contenant un tableau JSON borné,
dans l'ordre d'insertion (le plus ancien en premier) :

```jsonc
{
  "addresses": ["7xKX...9pQ2", "..."],  // FIFO, borné à RG-09 (5000)
  "updatedAt": 1752670800
}
```

`readSeenAddresses`/`writeSeenAddresses` lisent/écrivent ce fichier ; l'éviction FIFO garde les
`SEEN_POOLS_MAX` adresses les plus récentes (`list.slice(list.length - max)`).

> Si l'hébergement migre vers Cloudflare (§3, options 1/2), cette entité devient une clé KV
> (`seenPools` → même JSON) : le format de données ne change pas, seul le lecteur/écrivain change.

> **Idempotence** : une `address` déjà présente dans `SeenPools.addresses` n'est jamais
> re-notifiée, même après redémarrage (RG-07) — vérifié : un second run consécutif sur les mêmes
> pools ne déclenche aucune alerte.

---

## 7. Contrats d'interface

### 7.1 Entrée : API Meteora
Cf. §4. Toute réponse en échec passe par `readApiFailure`/`formatApiFailure` (`apiError.ts`).

### 7.2 Sortie : Discord Webhook
- `POST <DISCORD_WEBHOOK_URL>`
- Body :
  ```jsonc
  {
    "embeds": [{
      "title": "🆕 SOL/XYZ",
      "url": "https://app.meteora.ag/dlmm/7xKX...9pQ2",
      "color": 3066993,
      "fields": [
        { "name": "Bin step", "value": "100", "inline": true },
        { "name": "Frais", "value": "1.5%", "inline": true },
        { "name": "TVL", "value": "12 400 $", "inline": true }
      ],
      "timestamp": "2026-07-17T14:32:00.000Z"
    }]
  }
  ```
- Le webhook Discord est **le mécanisme le plus simple** : pas de bot à héberger, pas de
  commandes entrantes, une seule URL secrète à protéger. Suffisant pour ce cas d'usage
  (notification sortante uniquement, cf. §9).
- Codes de retour à gérer : `204` OK ; `429` (respecter `retry_after` du body) ; `401/404`
  (webhook invalide/supprimé → log critique).
- Limite Discord : 30 requêtes/min par webhook — largement suffisant ici (1 pool ≈ 1 requête,
  volume attendu très inférieur).

### 7.3 Sortie : Telegram Bot API
- `POST https://api.telegram.org/bot<TOKEN>/sendMessage`
- Body : `{ chat_id, text, parse_mode: "HTML", disable_web_page_preview: true }`
- Mêmes codes de retour et limites que documentés dans
  `telegram-alerts/SPECIFICATION-TECHNIQUE.md` §7.1 (~30 msg/s global, ~1 msg/s par chat).

---

## 8. Sécurité & gestion des secrets

- **Secrets serveur uniquement**, jamais `VITE_`-préfixés, jamais commités :
  - `DISCORD_WEBHOOK_URL` (si Discord actif)
  - `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` (si Telegram actif)
- Stockage (implémenté) : fichier `.env` local, gitignored, non commité — voir `.env.example`
  (créé) qui documente les noms sans valeurs. Si migration vers Cloudflare (§3, options 1/2) :
  passer aux secrets de la plateforme (Cloudflare Worker Secrets ou GitHub Actions Secrets).
- **Surface d'attaque** : le service n'expose aucun endpoint entrant (il appelle Discord/Telegram/
  Meteora, il n'écoute pas). Pas de webhook Telegram entrant, pas de commandes Discord — donc pas
  de surface HTTP à sécuriser au MVP.
- Le webhook Discord est un secret au même titre qu'un token : quiconque le possède peut poster
  dans le canal cible → à traiter avec la même rigueur qu'un token Telegram.

---

## 9. Impacts sur l'existant, mutualisation, risques

- **Impact SPA** : nul (additif, confirmé — aucun fichier `src/` modifié). `apiError.ts` est
  **importé directement** depuis `alerter/poolFetcher.ts` (`../src/lib/apiError.ts`) ; les types
  `MeteoraPool`/`PoolsResponse` sont dupliqués dans `alerter/types.ts` (même repo, mais processus
  d'exécution séparé de la SPA) — si l'API Meteora fait évoluer son contrat, mettre à jour les
  deux définitions.
- **Mutualisation avec `telegram-alerts/`** : non applicable pour l'instant (Supertrend non
  implémenté). Si les deux projets migrent un jour vers un Worker Cloudflare commun (§3), prévoir
  des clés KV **distinctes** (`seenPools` vs `TokenTrendState`/`AlertRecord`) pour éviter toute
  collision.
- **Risque R1 (API Meteora sans SLA documenté)** : pas de garantie de rate-limit ou de disponibilité
  publiée. Mitigation : un seul appel/cycle, backoff sur erreur, ne jamais bloquer sur un échec
  (US-05).
- **Risque R2 (webhook/token révoqué sans notification)** : si Discord/Telegram invalide le
  secret, les alertes échouent silencieusement côté utilisateur si les logs ne sont pas surveillés.
  Mitigation : logger les échecs `401/403/404` comme critiques (§7.2/§7.3), envisager une alerte
  de repli (ex. e-mail) en cas d'échec total — hors MVP, à noter comme dette.
- **Risque R3 (croissance de l'état local)** : bornée par RG-09 (5 000 adresses, éviction FIFO,
  vérifiée en test) — largement suffisant vu le volume de créations de pools DLMM observé.
- **Risque R4 (disponibilité, nouveau — issu du choix Q1)** : le script Node ne notifie que
  pendant qu'il tourne sur une machine allumée ; pas de garantie de continuité 24/7. Mitigation :
  migration vers Cloudflare Worker (§3, options 1/2) si ce besoin devient réel ; en attendant,
  laisser tourner le process (`npm run alerter`) sur une machine qui reste allumée.
- **Risque observé en test (rafale de rate-limit Discord)** : envoyer ~50 alertes en rafale (cas
  du tout premier run non-bootstrap simulé) a déclenché de vrais `429` Discord en quelques
  secondes. US-06/T19 (anti-rafale, actuellement Could) devrait être priorisé si une vraie rafale
  de créations de pools se produit en usage réel.

---

## 10. Tests

| Niveau | Cible | Exemples |
|--------|-------|----------|
| Unitaire | `diffDetector` | État vide → aucune pool signalée comme inédite (amorçage) ; état partiel → seules les adresses absentes sont inédites ; adresse déjà vue → jamais re-signalée |
| Unitaire | `config` validation | Aucun canal actif → démarrage avec avertissement, pas de crash ; secrets manquants pour un canal actif → refus de démarrer |
| Unitaire | `apiError` (déjà pur) | Mapping status/body → cause |
| Intégration | `poolFetcher` | Réponse Meteora mockée → pools normalisées, mêmes types que `PoolsPage.tsx` |
| Intégration | `stateStore` | Éviction FIFO au-delà de RG-09 ; persistance entre deux appels simulés |
| Intégration | `notifier` | Un canal qui échoue (mock 500) n'empêche pas l'envoi sur l'autre canal actif (`Promise.allSettled`) |
| E2E (léger, manuel au MVP) | pipeline complet | Pool mockée inédite → message reçu sur un canal Discord/Telegram de test |
