# Plan de mise en œuvre — Alertes « Nouvelle pool Meteora »

> Découpage par lots, backlog priorisé (MoSCoW + estimation relative S/M/L), jalons et risques.
> Aucune date ferme (non demandé). Références : `SPECIFICATION-FONCTIONNELLE.md` (US/RG) et
> `SPECIFICATION-TECHNIQUE.md` (§).
>
> **Mise à jour 2026-07-18** : Lots 0, 1, 2 et 4 sont **implémentés** (`alerter/`, PR #1) —
> hébergement Node local (pas Cloudflare, cf. spec technique §3), Discord et Telegram tous les
> deux actifs et testés. Détail par tâche dans le backlog (§2) et jalons (§4) ci-dessous.

---

## 0. Prérequis à valider AVANT de coder

| # | Prérequis | Statut | Bloque |
|---|-----------|--------|--------|
| P1 | Décision d'hébergement : mutualiser avec le Worker `telegram-alerts/` ou Worker séparé (Q1) | ✅ **Tranché** : script Node local (`alerter/`), ni l'un ni l'autre — voir spec technique §3 | Lot 1 |
| P2 | Choix du/des canal(aux) à activer en premier : Discord, Telegram, les deux (Q4) | ✅ **Tranché** : les deux, dès la première itération | Lot 4 |
| P3 | Si Discord : créer le webhook (Paramètres serveur → Intégrations → Webhooks), obtenir `DISCORD_WEBHOOK_URL` | ✅ fait, message de test reçu (`204`) | Lot 4 |
| P4 | Si Telegram : créer le bot via @BotFather, obtenir `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | ✅ fait, message de test reçu (`200`, `ok: true`) | Lot 4 |
| P5 | Confirmer les valeurs par défaut (intervalle 1 min, TVL min 0$, taille état 5000) — §9 spec fonctionnelle | ⏳ valeurs par défaut du code en place, non re-confirmées explicitement par Enzo | Lot 2/3 |
| P6 | Décider du traitement anti-rafale (Q2) — peut être reporté en Lot 5 | ⏳ à confirmer, non bloquant — un vrai `429` Discord observé en test de charge, cf. spec technique §9 | Lot 5 |

---

## 1. Découpage en lots / phases

### Lot 0 — Cadrage & décisions *(effort S)* — ✅ **fait**
P1/P2/P4 tranchés (voir §0). Squelette du service : dossier `alerter/` dédié (pas de partage avec
`telegram-alerts/`, non implémenté), `.env.example` créé.

### Lot 1 — Socle & ordonnancement *(effort S)* — **MVP** — ✅ **fait**
`main()`/boucle `setInterval` (`alerter/index.ts`) + `config` validée (`alerter/config.ts`) +
`logger` (`alerter/logger.ts`) + import direct de `apiError.ts` depuis `src/lib/`. Le premier
cycle loggue et tourne, vérifié en conditions réelles. Hébergement = process Node lancé
manuellement (`npm run alerter`), pas d'enveloppe serverless (cf. P1).

### Lot 2 — Fetch & détection de pools inédites *(effort M)* — **MVP, cœur** — ✅ **fait**
`poolFetcher.ts` (réutilise les types de `PoolsPage.tsx`, copiés dans `alerter/types.ts`),
`stateStore.ts` (fichier JSON local, éviction FIFO — pas KV, cf. P1), `diffDetector.ts` avec
amorçage silencieux au premier run (US-02). Vérifié : bootstrap sur 50 pools réelles sans alerte,
second run = 0 pool inédite (idempotence).

### Lot 3 — Filtres optionnels *(effort S)* — **Should** — ✅ **fait**
Filtre TVL minimum (RG-03) et exclusion `is_blacklisted` (RG-04) implémentés dans
`passesFilters()` (`alerter/index.ts`), configurables et désactivés/à zéro par défaut (US-04).
Non testés isolément (couverts par la relecture de code, pas de test unitaire dédié — cf. Lot 5/§10
spec technique, aucun runner de test en place).

### Lot 4 — Notifieurs Discord & Telegram *(effort M)* — **MVP** — ✅ **fait**
Interface `Notifier`, `discordNotifier` (webhook), `telegramNotifier` (Bot API), sélection via
`ALERT_CHANNELS`, envoi parallèle (`Promise.allSettled`) pour isoler les pannes par canal (US-05).
Format de message §8 (spec fonctionnelle) par canal. **Première alerte réelle envoyée** sur les
deux canaux (message de test manuel, pas encore une vraie création de pool — cf. J3 §4).

### Lot 5 — Robustesse & observabilité *(effort S)* — **MVP-** — ⏳ partiel
Logs structurés par cycle : ✅ fait (`logger.ts`, un événement JSON par étape du cycle). Retry
avec backoff sur échec d'envoi (RG-08) : ⏳ **pas implémenté** — un échec d'envoi est loggé mais
non retenté. Anti-rafale (US-06) : ⏳ pas implémenté, priorité à réévaluer suite au `429` Discord
observé en test de charge (spec technique §9).

### Lot 6 — Itérations *(Should / Could, post-MVP)*
Alerte de repli si un canal échoue durablement (dette notée en spec technique §9 R2), historique
des alertes, autres canaux (e-mail), page « Alertes » dans la SPA.

---

## 2. Backlog priorisé

| ID | Tâche | Lot | US / RG | MoSCoW | Effort | Dépend de |
|----|-------|-----|---------|--------|--------|-----------|
| T01 | Trancher hébergement (P1) et provisionner (Worker mutualisé ou dédié + Cron Trigger + KV) | 0 | — | Must | S | — |
| T02 | Créer webhook Discord et/ou bot Telegram (P3/P4) | 0 | US-03 | Must | S | — |
| T03 | Squelette service + `.env.example` | 0 | — | Must | S | T01 |
| T04 | Module `config` + validation (canaux actifs, secrets requis, seuils) | 1 | US-03, US-04 | Must | S | T03 |
| T05 | `scheduler` (Cron Trigger) + déploiement enveloppe | 1 | O4 | Must | S | T03 |
| T06 | Partager/porter `apiError.ts` + `logger` | 1 | US-05 | Must | S | T03 |
| T07 | `poolFetcher` (réutilise types `PoolsPage.tsx`) | 2 | US-01 | Must | S | T04,T06 |
| T08 | `stateStore` KV (`SeenPools`, éviction FIFO RG-09) | 2 | US-02, RG-07 | Must | M | T01 |
| T09 | `diffDetector` + amorçage silencieux premier run | 2 | US-02, RG-06 | Must | M | T07,T08 |
| T10 | Tests unitaires `diffDetector` (amorçage, dédup, adresses partielles) | 2 | §10 | Must | S | T09 |
| T11 | Filtre TVL minimum (RG-03) | 3 | US-04 | Should | S | T09 |
| T12 | Filtre `is_blacklisted` (RG-04) | 3 | US-04 | Should | S | T09 |
| T13 | Interface `Notifier` + `discordNotifier` (webhook) | 4 | US-01, US-03 | Must | S | T02,T06 |
| T14 | `telegramNotifier` (Bot API) | 4 | US-01, US-03 | Must | S | T02,T06 |
| T15 | Sélection multi-canal `ALERT_CHANNELS` + envoi parallèle isolé | 4 | US-03, US-05 | Must | S | T13,T14 |
| T16 | Format de message par canal (§8) | 4 | US-01 | Must | S | T13,T14 |
| T17 | Retry/backoff sur échec d'envoi (RG-08) | 5 | US-05 | Must | S | T15 |
| T18 | Logs structurés par cycle | 5 | O4, NFR | Should | S | T05 |
| T19 | Anti-rafale (throttle/agrégation) si P6 confirmé | 5 | US-06 | Could | M | T15 |
| T20 | Alerte de repli si canal en échec durable | 6 | R2 (spec technique) | Could | M | T17 |
| T21 | Page « Alertes » (historique) dans la SPA | 6 | — | Could | M | T08 |

---

## 3. Chemin critique (MVP)

`T01 → T03 → T04/T05/T06` (socle) puis `T07 → T08 → T09 → T10` (détection) en parallèle de
`T02 → T13/T14 → T15 → T16` (notifieurs) ; convergence à `T17` pour la robustesse minimale.
**Définition de « MVP livré »** = US-01, US-02, US-03, US-05 satisfaites (US-04 et US-06 sont
Should/Could, non bloquantes pour le MVP).

---

## 4. Jalons & définition de « terminé »

| Jalon | Contenu | « Terminé » quand… |
|-------|---------|---------------------|
| **J1 — Socle en ligne** | Lots 0-1 | ✅ atteint : le service exécute un cycle planifié et log ; config invalide = refus de démarrage (vérifié) |
| **J2 — Détection à sec** | Lot 2 | ✅ atteint sur données réelles (pas de mock) : bootstrap 50 pools sans alerte, second run = 0 pool inédite. Pas de test unitaire automatisé (pas de runner en place) |
| **J3 — Première alerte réelle** | Lot 4 | ⏳ **partiel** : message de test manuel reçu sur Discord et Telegram (§ci-dessus), mais **pas encore validé sur une vraie création de pool** en conditions réelles (le service n'a pas encore tourné assez longtemps pour en capter une) |
| **J4 — MVP robuste** | Lot 5 | ⏳ partiel : pannes API gérées (cycle suivant retente), logs par cycle exploitables ; retry/backoff sur échec d'envoi (RG-08) **pas encore implémenté** |
| **J5 — Itérations** | Lot 6 | Selon priorisation (filtres déjà faits en Lot 3, anti-rafale à réévaluer, alerte de repli…) |

---

## 5. Risques & mitigation

| Risque | Prob. | Impact | Mitigation |
|--------|-------|--------|-----------|
| R1 — API Meteora sans SLA documenté (latence/dispo) | Moyenne | Alertes manquées ou retardées | Backoff sur erreur, pas de blocage de cycle (US-05) |
| R2 — Webhook/token révoqué silencieusement | Faible | Perte totale d'alertes sans le savoir | Logs critiques sur 401/403/404, alerte de repli en dette (T20) |
| R3 — Mutualisation Worker avec `telegram-alerts/` mal isolée | Faible | Collision de clés KV, bug croisé | Clés KV distinctes (`seenPools` vs `TokenTrendState`), namespacer si mutualisé |
| R4 — Volume de pools sous-estimé (rafale) | Faible | Spam ponctuel | US-06/T19 en réserve, activable si observé en usage réel |

---

## 6. Estimation globale (indicative)

MVP (Lots 0-5, hors T11/T12/T19/T20/T21 Should/Could) ≈ **1 M + 12 S**. Sensiblement plus léger
que le projet Supertrend (`telegram-alerts/`) : pas de calcul d'indicateur, un seul appel API par
cycle, logique de diff déjà validée côté client dans `PoolsPage.tsx`.
