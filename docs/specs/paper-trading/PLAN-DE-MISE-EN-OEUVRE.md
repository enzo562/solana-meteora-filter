# Plan de mise en œuvre — Paper trading DLMM

> Découpage par lots, backlog priorisé (MoSCoW + estimation relative S/M/L), jalons et risques.
> Aucune date ferme (non demandé). Références : `SPECIFICATION-FONCTIONNELLE.md` (US/RG/Q) et
> `SPECIFICATION-TECHNIQUE.md` (§).
>
> Statut global : **spécifié, non implémenté** (2026-07-22).
>
> Principe de découpage : **livrer un premier P&L exploitable vite** (Lot 1-2 : pool réel + rejeu +
> P&L « solo »), puis raffiner le modèle et l'ergonomie. Le point de vigilance n'est pas l'effort de
> code (une page cliente, deux `fetch`, du calcul pur, zéro dépendance) mais **la validation des
> sources et la crédibilité du modèle** — d'où les spikes placés tôt (P1-P3).

---

## 0. Prérequis à valider AVANT / PENDANT de coder

| # | Prérequis | Statut | Bloque |
|---|-----------|--------|--------|
| P1 | **CORS + forme de `GET /pools/{address}` et `GET /ohlcv/{address}`** (Meteora datapi) — host déjà OK pour `/pools` via `PoolsPage`, sous-chemins à confirmer (spec tech §4, R3) | À faire (spike Lot 1) | Choix source OHLCV primaire vs repli |
| P2 | **Cohérence des unités de prix** (USD GeckoTerminal vs quote Meteora) sur un pool connu SOL/USDC (spec tech §4.2, R4) | À faire (spike Lot 1) | Exactitude IL/frais |
| P3 | **Historique OHLCV suffisant** sur la fenêtre 7 j (limite `limit`/rétention API) (R6) | À faire (spike Lot 1) | Faisabilité fenêtre 7 j |
| P4 | **Décision source OHLCV primaire** (Meteora vs GeckoTerminal) — dépend de P1/P2/P3 (spec tech §5, Q4) | Décidé par défaut : Meteora primaire, GeckoTerminal repli ; à confirmer après P1-P3 | Rien (bascule sans refonte) |
| P5 | **Formules `Spot`/`Curve`/`BidAsk`** : garder les approximations (§6.2) ou aller chercher les formules exactes du SDK Meteora (Q1) | Décidé pour le MVP : approximations documentées ; formules exactes = amélioration Lot 5 | Rien (isolé dans `strategyWeights`) |
| P6 | **Hypothèse de liquidité par défaut** exposée à l'utilisateur : « solo » (borne haute) et « part du pool » (RG-08, Q2) | Décidé : les **deux** proposées, défaut = « part du pool » (plus réaliste), bandeau explicite | Rien |

Aucun prérequis d'infra : pas de clé, pas de secret, pas de wallet, pas de compte. Le seul risque
susceptible de faire **basculer** un choix d'archi est P1 (source OHLCV) — et il ne fait que choisir
entre deux sources déjà connues, avec un repli garanti (GeckoTerminal éprouvé). Aucun prérequis n'est
donc réellement **bloquant** pour démarrer le Lot 0.

---

## 1. Découpage en lots / phases

### Lot 0 — Squelette de page & routing *(effort S)* — MVP
Créer `src/pages/PaperTradingPage.tsx` : champ « adresse de pool » + validation (RG-01), formulaire
de position (plage bins, stratégie, montant, fenêtre, hypothèse de liquidité) **désactivé tant qu'
aucun pool n'est chargé**, aucun fetch encore. Ajouter route `/paper-trading` + item `NAV_ITEMS`
dans `src/App.tsx`. **Livrable** : l'onglet existe, les entrées sont validées côté client, rien n'est
appelé sur entrée invalide (US-01/US-02, RG-01).

### Lot 1 — Chargement du pool réel *(effort M)* — MVP, socle données
Spikes **P1/P2/P3** (CORS/forme/unités/historique) en tête de lot. Puis : `GET /pools/{address}`
(Meteora), mapping vers `PoolState`, gestion `notFound` vs `error` (RG-02, RG-11) via `apiError.ts`,
affichage du bloc **Pool** (paire, binStep, fee, TVL, prix, âge) + liens externes (US-08). **Livrable** :
coller une adresse affiche les **paramètres réels** du pool ; pool inconnu = « introuvable » ; source
down = message clair. Décision **P4** (source OHLCV) prise à l'issue des spikes.

### Lot 2 — Cœur de simulation : rejeu + P&L « solo » *(effort L)* — MVP, valeur centrale
Module pur `src/pages/paperTrading/simulate.ts` (§6 technique) : `binPrice`, `strategyWeights`,
rejeu bougie par bougie, frais estimés (**hypothèse « solo »** d'abord — la plus simple, RG-08),
IL concentré, sortie `SimulationResult`. Fetch OHLCV (source décidée en P4, repli §5) + normalisation
bougies **fermées** (anti-repainting, comme `ohlcvClient.ts`). Bloc **P&L décomposé** (frais, IL,
net $/%, position vs hold, temps dans la plage, nb bougies) — US-03. Refus si bougies insuffisantes
(RG-12). **Livrable** : un premier P&L estimé exploitable de bout en bout (US-01→US-03).

### Lot 3 — Hypothèse « part du pool » & bandeau d'hypothèses *(effort M)* — MVP, honnêteté
Ajouter l'hypothèse de liquidité **« part du pool »** (RG-08) sélectionnable, taux de frais effectif
`fees/volume` avec repli `base_fee_pct` et **origine affichée** (RG-05), **bandeau d'hypothèses +
niveau de fiabilité** toujours visible (US-04, O4), avertissements de fiabilité (RG-07). **Livrable** :
l'estimation n'est jamais présentée comme exacte ; l'utilisateur voit et pilote les hypothèses. C'est
la condition pour que le MVP soit **honnête** (exigence non fonctionnelle centrale).

### Lot 4 — Isolation, relance & réutilisation OHLCV *(effort S)* — MVP
Formaliser les `BlockState` par source, `AbortController` par appel (R8), **relance sans re-fetch**
si pool+fenêtre inchangés (US-05), réinitialisation propre au relancement (RG-09), repli OHLCV
signalé (§9). (Peut fusionner avec Lot 2/3 si fait proprement d'emblée.) **Livrable** : comparer des
configs est fluide et fiable, une source qui traîne/échoue n'écrase rien.

### Lot 5 — Historique/favoris & finitions *(effort M)* — Should
Persistance `localStorage` (§8 technique, mirroir scanner) : historique daté, favoris jamais évincés,
plafond non-favoris, re-remplissage du formulaire au clic (US-06, RG-10). Finitions : largeur de
plage en % à la saisie (RG-03), sens métier par bloc, formatage lisible, code couleur P&L, cohérence
visuelle. Éventuel affinage des poids `Curve`/`BidAsk` vers les formules exactes du SDK (P5, Q1) si
disponibles. **Livrable** : page complète et ergonomique.

### Lot 6 — Itérations *(Could / Won't-MVP, post-MVP)*
- **Sélection du pool depuis `/pools`** (bouton « simuler ce pool » → pré-remplit l'adresse) *(Could)*.
- **Comparaison côte-à-côte** de deux configs à l'écran *(Could)*.
- **Lecture on-chain de la distribution par bin** via SDK/RPC public (lève Q2, précision réelle des
  frais) — introduit `@meteora-ag/dlmm`/`web3.js`, à peser *(Could, Q5)*.
- **Fee dynamique par bougie** (reconstruire le fee dynamique au lieu d'un taux constant) *(Could)*.
- **Simulation de rebalancement** (façon Hawkfi) au lieu d'une position statique *(Won't-MVP, Q8)*.
- **Pool hypothétique / trajectoire simulée** *(Won't-MVP, Q6)* ; **projection future Monte-Carlo**
  *(Won't-MVP, Q7)*.

---

## 2. Backlog priorisé

| ID | Tâche | Lot | US / RG / Q | MoSCoW | Effort | Dépend de |
|----|-------|-----|-------------|--------|--------|-----------|
| T01 | Créer `PaperTradingPage.tsx` (champ pool + formulaire position désactivé) | 0 | US-01, US-02 | Must | S | — |
| T02 | Validation entrées côté client (adresse base58, montant > 0, bins ≥ 1, fenêtre) | 0 | US-01, US-02, RG-01 | Must | S | T01 |
| T03 | Route `/paper-trading` + item `NAV_ITEMS` dans `App.tsx` | 0 | — | Must | S | T01 |
| T04 | Spike CORS/forme `/pools/{address}` + `/ohlcv/{address}` (P1) | 1 | Q4, R3 | Must | S | — |
| T05 | Spike unités de prix USD vs quote sur SOL/USDC (P2) | 1 | R4 | Must | S | — |
| T06 | Spike rétention/limite OHLCV sur 7 j (P3) | 1 | R6 | Must | S | — |
| T07 | Fetch `GET /pools/{address}` + mapping `PoolState` + types tolérants | 1 | US-01 | Must | M | T01, T04 |
| T08 | Gestion `notFound` vs `error` (apiError) | 1 | US-01, RG-02, RG-11 | Must | S | T07 |
| T09 | Bloc **Pool** (paire, binStep, fee, TVL, prix, âge) + liens externes | 1 | US-01, US-08 | Must | S | T07 |
| T10 | Décision source OHLCV primaire (P4) | 1 | Q4 | Must | S | T04,T05,T06 |
| T11 | Module `simulate.ts` : `binPrice`, grille de bins, bornes de plage | 2 | RG-03 | Must | S | — |
| T12 | `strategyWeights` (Spot/Curve/BidAsk, approx documentées) | 2 | RG-04, Q1 | Must | M | T11 |
| T13 | Fetch OHLCV (source P4) + normalisation bougies fermées (anti-repainting) | 2 | US-07 | Must | M | T10 |
| T14 | Rejeu bougie par bougie + frais estimés « solo » | 2 | US-03, RG-06 | Must | L | T11,T12,T13 |
| T15 | IL concentré + `SimulationResult` (net, position vs hold, temps dans plage) | 2 | US-03 | Must | L | T14 |
| T16 | Bloc **P&L décomposé** + refus si bougies insuffisantes (RG-12) | 2 | US-03, RG-12 | Must | M | T15 |
| T17 | Hypothèse « part du pool » (share via TVL/plage) | 3 | RG-08, Q2 | Must | M | T14 |
| T18 | Taux de frais effectif `fees/volume` + repli `base_fee_pct` + origine affichée | 3 | RG-05 | Must | S | T14 |
| T19 | Bandeau d'hypothèses + niveau de fiabilité (toujours visible) | 3 | US-04, O4 | Must | M | T16,T17,T18 |
| T20 | Avertissements de fiabilité (peu de bougies, taux indéductible) | 3 | RG-07 | Must | S | T16,T18 |
| T21 | `BlockState` par source + `AbortController` + réinit au relancement | 4 | US-05, RG-09, R8 | Should | S | T07,T13 |
| T22 | Relance sans re-fetch si pool+fenêtre inchangés | 4 | US-05 | Should | S | T13 |
| T23 | Repli OHLCV (primaire → GeckoTerminal) signalé | 4 | US-07, R3 | Should | S | T13 |
| T24 | Persistance `localStorage` (historique/favoris, mirroir scanner) | 5 | US-06, RG-10 | Should | M | T16 |
| T25 | Re-remplissage du formulaire depuis une entrée d'historique | 5 | US-06 | Should | S | T24 |
| T26 | Largeur de plage % à la saisie + sens métier + formatage/couleurs | 5 | US-02, US-03, RG-03 | Should | S | T09,T16 |
| T27 | Invariants de `simulate.ts` (sanity-check ad hoc, §12 technique) | 5 | — | Should | S | T15,T17 |
| T28 | Bouton « simuler ce pool » depuis `/pools` | 6 | — | Could | S | T07 |
| T29 | Comparaison côte-à-côte de deux configs | 6 | O2 | Could | M | T16 |
| T30 | Lecture on-chain distribution par bin (SDK/RPC) | 6 | Q5 | Could | L | — |
| T31 | Fee dynamique par bougie | 6 | — | Could | M | T14 |
| T32 | Simulation de rebalancement (Hawkfi-like) | 6 | Q8 | Won't (MVP) | L | T15 |
| T33 | Pool hypothétique / trajectoire simulée | 6 | Q6 | Won't (MVP) | L | — |
| T34 | Projection future Monte-Carlo | 6 | Q7 | Won't (MVP) | L | — |

---

## 3. Chemin critique (MVP)

`T01 → T02/T03` (squelette) → `T04/T05/T06 → T10` (spikes sources + décision) → `T07/T08/T09`
(pool réel) → `T11/T12/T13 → T14/T15/T16` (cœur de simulation) → `T17/T18/T19/T20` (honnêteté du
modèle). **Définition de « MVP livré »** = US-01, US-02, US-03, US-04, US-07, US-08 satisfaites,
avec les deux hypothèses de liquidité et le bandeau d'hypothèses (O4). US-05 (isolation/relance
fluide) et US-06 (historique) sont **Should**, non bloquants pour un premier usage.

---

## 4. Jalons & définition de « terminé »

| Jalon | Contenu | « Terminé » quand… |
|-------|---------|---------------------|
| **J1 — Onglet en place** | Lot 0 | L'onglet `/paper-trading` existe, entrées validées, aucun appel réseau sur entrée invalide |
| **J2 — Pool réel chargé** | Lot 1 | Une adresse valide affiche les paramètres réels du pool ; pool inconnu = « introuvable » ; source down = message ; source OHLCV décidée (P4) |
| **J3 — Premier P&L** | Lot 2 | Un pool + une position produisent un P&L décomposé (mode « solo ») de bout en bout ; bougies fermées, anti-repainting ; refus propre si données insuffisantes |
| **J4 — MVP honnête** | Lot 3 | Hypothèse « part du pool » disponible ; taux de frais et origine affichés ; **bandeau d'hypothèses + fiabilité toujours visibles** ; avertissements de fiabilité — l'estimation n'est jamais présentée comme exacte |
| **J5 — Confort & persistance** | Lots 4-5 | Relance fluide sans re-fetch, isolation sources ; historique/favoris `localStorage` ; finitions visuelles ; invariants de `simulate.ts` vérifiés |
| **J6 — Itérations** | Lot 6 | Selon priorisation (sélection depuis `/pools`, comparaison, on-chain, rebalance…) |

---

## 5. Risques & mitigation

| Risque | Prob. | Impact | Mitigation |
|--------|-------|--------|-----------|
| R1 — Précision absolue du modèle limitée (Q2/Q3 : pas de liquidité/volume par bin gratuits) | Certaine | P&L absolu approximatif | Hypothèses **affichées** (O4) ; « solo » (borne haute) vs « part du pool » pour encadrer ; usage surtout **comparatif** ; jamais présenté comme exact |
| R2 — Formules Spot/Curve/BidAsk exactes inconnues (Q1) | Moyenne | Différenciation stratégies approx. | Approx. documentées, isolées et remplaçables (`strategyWeights`) ; forme qualitative correcte ; affinage Lot 5 possible |
| R3 — CORS/forme `/ohlcv/{address}` Meteora non confirmés (P1/Q4) | Moyenne | Source primaire OHLCV KO | Repli **GeckoTerminal déjà éprouvé** ; calcul indépendant de la source ; décision P4 après spike |
| R4 — Mélange d'unités de prix (P2) | Moyenne | IL/frais faussés | Une seule série cohérente ; frais/montant en USD via `current_price` ; validé sur SOL/USDC (T05) |
| R5 — Historique OHLCV trop court pour 7 j (P3/R6) | Moyenne | Fenêtre 7 j partielle | Simuler sur le dispo + avertissement (RG-07) ou refus (RG-12) ; borner par `created_at` |
| R6 — Rate limit tiers ponctuel | Faible | Chargement en erreur ponctuelle | 2 fetch/simulation, pas de polling ; `apiError.ts` gère 429 ; relance manuelle |
| R7 — Utilisateur prend l'estimation pour argent comptant | Moyenne | Décision de capital sur un chiffre biaisé | Le bandeau d'hypothèses (J4) est un **livrable Must**, pas une finition ; vocabulaire « estimé » systématique |

---

## 6. Estimation globale (indicative)

MVP (Lots 0-3, hors Should/Could) ≈ **3 L + 3 M + ~8 S**. Le poids n'est **pas** dans l'infra (une
page cliente, deux `fetch` sans clé, aucune dépendance npm, aucun secret) mais dans le **module de
calcul pur** (`simulate.ts`, T11-T18 : maths de bins, frais, IL concentré) et dans la **crédibilité
honnête du modèle** (T19-T20, bandeau d'hypothèses). Les spikes sources (T04-T06) sont légers mais à
faire tôt car ils tranchent P4. Le reste (isolation, historique, finitions) est du S/M déjà rodé
ailleurs dans le repo (patterns `BlockState`, `AbortController`, `localStorage` du scanner).
```
