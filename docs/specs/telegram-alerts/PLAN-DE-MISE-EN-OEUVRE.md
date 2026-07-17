# Plan de mise en œuvre — Alertes Telegram « Supertrend Breakout »

> Découpage par lots, backlog priorisé (MoSCoW + estimation relative S/M/L), jalons et risques.
> Aucune date ferme (non demandé). Références : `SPECIFICATION-FONCTIONNELLE.md` (US/RG) et
> `SPECIFICATION-TECHNIQUE.md` (§).

---

## 0. Prérequis à valider AVANT de coder

| # | Prérequis | Statut | Bloque |
|---|-----------|--------|--------|
| P1 | Décision d'hébergement | ✅ **Tranché (D1)** : serverless gratuit → Cloudflare Worker + Cron Trigger + KV | Lot 1 |
| P2 | Décision source OHLCV | ✅ **Tranché (D2)** : GeckoTerminal (Birdeye en fallback documenté) | Lot 2 |
| P3 | Création du **bot Telegram** (via @BotFather) → obtenir `TELEGRAM_BOT_TOKEN` + `chat_id` cible | ⏳ à faire | Lot 4 |
| P4 | Accès/clé API selon source retenue (non nécessaire pour GeckoTerminal ; garder Birdeye en réserve) | ✅ sans objet au MVP (D2) | Lot 2 |
| P5 | Confirmation des **paramètres par défaut** (volume 30k, mcap 300k-300M, ATR 10×3, cooldown 4h) | ✅ confirmés (aucune objection d'Enzo) | Lot 2/3 |
| P6 | Confirmation de la **définition de « cassé »** et du **sens du flip alerté** | ✅ **Tranché (D4/D5)** : flip d'état Supertrend, **haussier uniquement**, jamais baissier | Lot 3 |

---

## 1. Découpage en lots / phases

### Lot 0 — Cadrage & décisions *(effort S)*
Trancher P1-P6. Choisir le store d'état selon l'hébergement. Mettre en place le squelette du
service (dossier `alerter/`, `.env.example`, runner de test Vitest).

### Lot 1 — Socle & ordonnancement *(effort M)* — **MVP**
Scheduler + config validée + logger + partage de `apiError.ts`. Un cycle « à vide » qui log qu'il
tourne. Déploiement de l'enveloppe d'hébergement choisie (cron/worker/process).

### Lot 2 — Screener & univers de candidats *(effort M)* — **MVP**
Construire l'univers volume5m + mcap (bornes 300k/300M) depuis la source screener. Filtrer le
plancher mcap côté service (Birdeye n'a pas de `min_market_cap`). Borne d'univers (RG-11).

### Lot 3 — OHLCV + Supertrend + détection de flip *(effort L)* — **MVP, cœur**
Client OHLCV 15 min normalisé (exclusion bougie en cours), fonction pure `supertrend()`,
`flipDetector` avec run d'amorçage. Tests unitaires du cœur (validés contre TradingView).

### Lot 4 — Notification Telegram + dédup/cooldown *(effort M)* — **MVP**
`stateStore` (persistance état + AlertRecord), `telegramNotifier` (format §8 fonctionnel, retry
RG-09), idempotence `(mint, direction, candleTs)`. Première alerte réelle de bout en bout.

### Lot 5 — Robustesse & observabilité *(effort M)* — **MVP-**
Isolation par token (`Promise.allSettled`), backoff rate-limit, throttle OHLCV + cache 15 min,
logs structurés par cycle (nb candidats/flips/alertes/erreurs).

### Lot 6 — Itérations *(Should / Could, post-MVP)*
Anti-rafale throttle/agrégation (US-07/Q5), watchlist manuelle (Q3), autres canaux (Discord),
page « Alertes » dans la SPA. *(Les flips baissiers ne figurent plus dans ce lot — exclus
définitivement du périmètre, cf. US-06 révisée.)*

---

## 2. Backlog priorisé

| ID | Tâche | Lot | US / RG | MoSCoW | Effort | Dépend de |
|----|-------|-----|---------|--------|--------|-----------|
| T01 | Provisionner Cloudflare Worker + Cron Trigger + KV (P1 tranché : D1) | 0 | — | Must | S | — |
| T02 | Implémenter le client GeckoTerminal OHLCV (P2 tranché : D2, pas de clé requise) | 0 | — | Must | S | — |
| T03 | Créer bot Telegram, récupérer token + chat_id (P3) | 0 | US-01 | Must | S | — |
| T04 | Squelette service + `.env.example` + Vitest | 0 | — | Must | S | T01 |
| T05 | Module `config` + validation (refus si incohérent) | 1 | US-04, RG-01..07 | Must | S | T04 |
| T06 | `scheduler` (cron/interval) + déploiement enveloppe | 1 | O4 | Must | M | T04 |
| T07 | Partager/porter `apiError.ts` + `logger` | 1 | US-05 | Must | S | T04 |
| T08 | `screener` : univers volume5m + mcap (bornes + plancher côté service) | 2 | US-03, RG-01..03,11 | Must | M | T05,T07 |
| T09 | `ohlcvClient` : fetch + normalisation 15m, exclusion bougie en cours | 3 | RG-04,08,10 | Must | M | T08 |
| T10 | Fonction pure `supertrend()` (ATR Wilder, bandes, état) | 3 | RG-05,12 | Must | M | T04 |
| T11 | Tests unitaires `supertrend` vs TradingView | 3 | §12 | Must | M | T10 |
| T12 | `flipDetector` + run d'amorçage + rattrapage multi-bougies | 3 | US-02, RG-08, cas limites | Must | M | T10 |
| T13 | `stateStore` (TokenTrendState + AlertRecord) | 4 | idempotence | Must | M | T01,T12 |
| T14 | `telegramNotifier` : format message §8 + retry | 4 | US-01, RG-09 | Must | M | T03,T07 |
| T15 | Dédup/cooldown `(mint,direction,candleTs)` + RG-07 | 4 | US-02, RG-07 | Must | S | T13,T14 |
| T16 | Isolation par token + backoff rate-limit | 5 | US-05 | Must | S | T08,T09 |
| T17 | Throttle OHLCV + cache 15 min | 5 | R1, §10 | Should | M | T09 |
| T18 | Logs structurés par cycle (observabilité) | 5 | O4, NFR | Should | S | T06 |
| T20 | Anti-rafale : throttle Telegram / message agrégé (Q5) | 6 | US-07 | Should | M | T14 |
| T21 | Watchlist manuelle de tokens (Q3) | 6 | — | Could | M | T08 |
| T22 | Canal Discord / abstraction notifier | 6 | H1 | Could | M | T14 |
| T23 | Page « Alertes » (historique) dans la SPA | 6 | — | Could | M | T13 |

---

## 3. Chemin critique (MVP)

`T01 → T04 → T05 → T06` (socle) puis `T08 → T09` (données) en parallèle de `T10 → T11 → T12`
(cœur algo) ; convergence sur `T13 → T14 → T15` (alerte + dédup) ; puis `T16` pour la robustesse
minimale. **Définition de « MVP livré »** = US-01, US-02, US-03, US-04, US-05 satisfaites.

---

## 4. Jalons & définition de « terminé »

| Jalon | Contenu | « Terminé » quand… |
|-------|---------|---------------------|
| **J1 — Socle en ligne** | Lots 0-1 | Le service déployé exécute un cycle vide planifié et log ; config invalide = refus de démarrage |
| **J2 — Détection à sec** | Lots 2-3 | Sur données réelles/mockées, le pipeline calcule le Supertrend et logge les flips détectés (sans encore notifier) ; tests `supertrend` verts |
| **J3 — Première alerte réelle** | Lot 4 | Un flip qualifiant déclenche **une** alerte Telegram formatée ; rejouer le même flip ne renvoie rien (idempotence) |
| **J4 — MVP robuste** | Lot 5 | Une panne d'API n'arrête pas le service ; rate-limit respecté ; logs par cycle exploitables ; US-01→05 validées |
| **J5 — Itérations** | Lot 6 | Selon priorisation (flips baissiers, anti-rafale, watchlist…) |

---

## 5. Risques & mitigation

| Risque | Prob. | Impact | Mitigation |
|--------|-------|--------|-----------|
| R1 — Rate-limit OHLCV dépassé (GeckoTerminal ~30/min) | Élevée | Alertes manquées | Borne univers (RG-11), throttle + cache 15 min (T17), fallback Birdeye |
| R2 — Faux flips (bougies peu liquides / gaps) | Moyenne | Alertes parasites | Min volume/liquidité, ignorer bougies à volume nul, valider vs TradingView (T11) |
| R3 — Granularité cron serverless > latence O2 | Moyenne | Alerte tardive | Cloudflare Cron fin ou Node persistant (Q1) |
| R4 — Secret Telegram fuité | Faible | Détournement du bot | Secrets plateforme, jamais `VITE_`/commit, rotation possible |
| R5 — Mapping token→pool erroné (source par pool) | Moyenne | Mauvaises bougies | Choisir le pool le plus liquide, ou Birdeye par mint |
| R6 — Dérive des seuils entre SPA et service | Faible | Incohérence | Config centralisée si mono-repo |

---

## 6. Estimation globale (indicative)

MVP (Lots 0-5) ≈ **3 L + 8 M + 6 S**. Le poste le plus lourd et le plus à risque est le **Lot 3**
(OHLCV + Supertrend + flip) : c'est là qu'il faut concentrer les tests. Les lots 0-1-2 sont rapides
si les décisions P1-P6 sont prises en amont.
