# Plan de mise en œuvre — Scanner de risque token

> Découpage par lots, backlog priorisé (MoSCoW + estimation relative S/M/L), jalons et risques.
> Aucune date ferme (non demandé). Références : `SPECIFICATION-FONCTIONNELLE.md` (US/RG/Q) et
> `SPECIFICATION-TECHNIQUE.md` (§).
>
> Principe de découpage : **livrer de la valeur dès le Lot 1** (RugCheck seul = déjà un verdict de
> risque exploitable), puis ajouter les sources par ordre de robustesse (DexScreener très sûr →
> liens externes triviaux → iframe Bubblemaps à valider). Statut global : **implémenté en un seul
> passage (2026-07-19)** — les Lots 0 à 4 ont été livrés ensemble plutôt qu'étalés. **Lot 5 livré
> (2026-07-19)** : sens métier par indicateur, code couleur du score global (RG-07), badges
> `warn`/`danger` sur `risks[]`, affichage du champ `value`, adresse copiable, % formatés. Seul le
> Lot 6 — **score agrégé maison (T23) et historique/favoris (T25) livrés (2026-07-19/20)**. T24
> (visualisation native du bubblemap) reste explicitement **Won't** : nécessiterait l'API B2B
> payante de Bubblemaps, incompatible avec la contrainte « gratuit, sans clé » du projet.

---

## 0. Prérequis à valider AVANT / PENDANT de coder

| # | Prérequis | Statut | Bloque |
|---|-----------|--------|--------|
| P1 | ~~Vérifier le CORS RugCheck~~ (Q1/R1) | ✅ **fait (2026-07-19)** — `curl` avec `Origin` header confirme `Access-Control-Allow-Origin: *`, aucun repli nécessaire | — |
| P2 | Vérifier le **format réel de `risks[]`** sur un token risqué (Q4/R4) | ✅ **fait (2026-07-19)** — testé sur ~60 tokens pump.fun réels ; schéma `{name,value,description,score,level}` confirmé, aucun label sniper/phishing observé | — |
| P3 | Confirmer l'**URL GMGN** (`/sol/token/` vs `?chain=sol`, Q7) | ✅ **fait (2026-07-19)** — `https://gmgn.ai/sol/token/{address}` confirmé par test manuel ; GMGN par ailleurs bloqué par anti-bot Cloudflare pour tout accès programmatique | — |
| P4 | Confirmer/valider l'**URL Deepnets par token** (Q6) | ✅ **fait (2026-07-19)** — `https://deepnets.ai/token/{address}` confirmé ; une vraie API existe (`api.deepnets.ai/api/token-safety`) mais payante (x402, 0.01 USDC/appel) → décision : ne pas intégrer, lien externe seulement | — |
| P5 | ~~Valider l'iframe Bubblemaps~~ (Q5/R3) | ✅ **fait (2026-07-19)** — testée en navigateur réel (Playwright), charge sans clé et sans blocage CSP | — |
| P6 | Décider Snipers/Phishing : ce qui remonte de `risks[]` vs « non couvert » (Q2/Q3) | ✅ **fait (2026-07-19)** — décision confirmée par P2 : garder le filtrage best-effort par mots-clés (RG-04 respecté), aucun changement de code requis, mais attendre-toi à ce qu'il reste silencieux en pratique | — |

Aucun prérequis d'infra : pas de clé API, pas de secret, pas de compte à provisionner (contraste
avec `alerter/`). P1 était le seul risque susceptible de changer l'architecture d'un bloc — levé,
le fetch client direct vers RugCheck est confirmé viable. Tous les prérequis (P1-P6) sont désormais
levés.

---

## 1. Découpage en lots / phases

### Lot 0 — Squelette de page & routing *(effort S)* — MVP
Créer `src/pages/TokenScannerPage.tsx` (champ CA + bouton + validation RG-02, aucun fetch encore) ;
ajouter route `/scanner` + item `NAV_ITEMS` dans `src/App.tsx`. Livrable : l'onglet existe, le CA
est validé côté client, rien n'est appelé tant que le format est invalide (US-07).

### Lot 1 — Intégration RugCheck *(effort M)* — MVP, cœur
Appel `GET .../tokens/{mint}/report`, types tolérants (§5 technique), mapping vers les blocs
**Risque global**, **Insiders**, **Burnt/Authorities** avec sens métier et code couleur (§6/§8).
Gestion d'erreur via `apiError.ts` + distinction 404 « token inconnu » vs erreur réelle. Le fetch
client direct est validé (P1, plus de spike à faire). **Valeur livrée dès ce lot** : un verdict de
risque exploitable à partir d'un CA.

### Lot 2 — Isolation & états par bloc *(effort S)* — MVP
Formaliser les `BlockState` par source (idle/loading/ok/unknown/error), affichage **progressif**
(chaque bloc s'affiche dès sa réponse), `AbortController` par appel (R7). Garantit US-01/US-06 même
quand une source traîne ou échoue. (Peut fusionner avec Lot 1 si fait proprement d'emblée.)

### Lot 3 — DexScreener « Dex Paid » + liens externes *(effort S)* — MVP
`GET orders/v1/solana/{ca}` → `paid = some(status==="approved")` (RG-06), badge oui/non/non-dispo
(US-04). Blocs de **liens externes** GMGN/Deepnets/Bubblemaps/RugCheck/DexScreener (US-05), après
validation des URLs (P3/P4). Source DexScreener = la plus sûre (déjà utilisée sans souci CORS).

### Lot 4 — Bubblemap embed *(effort S)* — Should
Iframe `app.bubblemaps.io/sol/token/{ca}` (validée P5), lien externe du Lot 3 gardé visible en
permanence à côté (Bubblemaps peut afficher son propre « non supporté » dans l'iframe pour certains
tokens). Bloc visuel, aucune donnée structurée récupérée.

### Lot 5 — Finitions & sens métier *(effort S)* — Should
Textes de contexte par indicateur (§8 fonctionnel), rappel explicite « score : plus haut = plus
risqué » (RG-07), formatage lisible (adresses tronquées/copiables, %), traitement propre des cas
« non couvert » (Snipers/Phishing) selon décision P6, cohérence visuelle avec les autres pages.

### Lot 6 — Itérations *(Could, post-MVP)*
Score agrégé maison (Q8) ; visualisation **native** du bubblemap (nécessiterait l'API payante +
une lib de graphe) ; historique/favoris de CA analysés ; sources payantes (Bubblemaps B2B, GMGN
Cooperation-API) si le besoin le justifie ; analyse multi-CA.

---

## 2. Backlog priorisé

| ID | Tâche | Lot | US / RG / Q | MoSCoW | Effort | Dépend de |
|----|-------|-----|-------------|--------|--------|-----------|
| T01 | Créer `TokenScannerPage.tsx` (champ + bouton) | 0 | US-01 | Must | S | — |
| T02 | Validation format CA côté client (base58, longueur) | 0 | US-07, RG-02 | Must | S | T01 |
| T03 | Route `/scanner` + item `NAV_ITEMS` dans `App.tsx` | 0 | — | Must | S | T01 |
| T04 | ~~Spike CORS RugCheck~~ | 1 | Q1, R1 | — | — | ✅ fait (2026-07-19), voir §0/P1 |
| T05 | Fetch RugCheck `report` + types tolérants | 1 | US-01 | Must | M | T01 |
| T06 | Mapping bloc **Risque global** (score, risks[], rugged, échelle) | 1 | US-02, RG-07 | Must | M | T05, T09 |
| T07 | Mapping bloc **Insiders** (graphInsidersDetected, insiderNetworks) | 1 | US-01 | Must | S | T05 |
| T08 | Mapping bloc **Burnt/Authorities** (mint/freeze authority, LP lock) | 1 | US-01 | Must | S | T05 |
| T09 | Vérifier format réel `risks[]` sur token risqué (P2) | 1 | Q4, R4 | Must | S | T05 |
| T10 | Gestion erreur RugCheck via `apiError.ts` + 404=«inconnu» | 1 | US-06, RG-03 | Must | S | T05 |
| T11 | `BlockState` par source + affichage progressif | 2 | US-01, US-06 | Must | S | T05 |
| T12 | `AbortController` par appel (annulation au relancement) | 2 | R7 | Should | S | T11 |
| T13 | Fetch DexScreener orders + dérivation Dex Paid | 3 | US-04, RG-06 | Must | S | T11 |
| T14 | Badge Dex Paid oui/non/non-disponible | 3 | US-04 | Must | S | T13 |
| T15 | ~~Confirmer URL GMGN~~ (P3) + lien externe | 3 | US-05, Q7 | Must | S | ✅ fait (2026-07-19), voir §0/P3 |
| T16 | ~~Confirmer URL Deepnets~~ (P4) + lien externe | 3 | US-05, Q6 | Should | S | ✅ fait (2026-07-19), voir §0/P4 — lien mis à jour dans `TokenScannerPage.tsx` |
| T17 | Liens externes RugCheck / DexScreener (repli) | 3 | US-05, R1 | Must | S | — |
| T18 | ~~Valider iframe Bubblemaps~~ (P5) | 4 | Q5, R3 | — | — | ✅ fait (2026-07-19), voir §0/P5 |
| T19 | Bloc Bubblemap : iframe + lien externe toujours visible | 4 | US-05 | Should | S | T17 |
| T20 | Textes de sens métier par indicateur | 5 | US-03 | Should | S | T06,T07,T08,T14 |
| T21 | Traitement « non couvert » Snipers/Phishing (décision P6) | 5 | Q2, Q3, RG-04 | Should | S | T09 |
| T22 | Formatage lisible (adresses, %, couleurs cohérentes) | 5 | US-03 | Should | S | T06,T07,T08 |
| T23 | ~~Score agrégé maison~~ | 6 | Q8 | Could | M | ✅ fait (2026-07-19) — pondération 40/25/20/15 (RugCheck/authorities/LP/insiders), Dex Paid+Snipers+Phishing exclus, poids redistribué si signal absent |
| T24 | Visualisation native du bubblemap (API payante + lib graphe) | 6 | — | Won't (MVP) | L | — |
| T25 | ~~Historique / favoris de CA~~ | 6 | — | Could | M | ✅ fait (2026-07-20) — persistance `localStorage`, favoris jamais évincés, plafond 20 non-favoris |

---

## 3. Chemin critique (MVP)

`T01 → T02/T03` (squelette) → `T05 → T06/T07/T08/T10` (RugCheck, plus de spike bloquant, CORS
tranché en amont) → `T11` (isolation) → `T13/T14` + `T15/T17` (Dex Paid & liens). **Définition de
« MVP livré »** = US-01, US-02, US-04, US-05, US-06, US-07 satisfaites (US-03 = sens métier
détaillé et le bloc Bubblemap iframe sont Should, non bloquants).

---

## 4. Jalons & définition de « terminé »

| Jalon | Contenu | « Terminé » quand… |
|-------|---------|---------------------|
| **J1 — Onglet en place** | Lot 0 | L'onglet `/scanner` existe, le CA est validé, aucun appel réseau sur CA invalide |
| **J2 — Verdict RugCheck** | Lots 1-2 | Un CA valide affiche risque global + insiders + authorities ; token inconnu = « inconnu » ; source down = bloc en erreur isolé (CORS déjà tranché, P1 ✅) |
| **J3 — MVP complet** | Lot 3 | Dex Paid oui/non/non-dispo affiché ; liens externes ouvrent le bon token (P3/P4 validés) ; toutes les US Must satisfaites |
| **J4 — Bubblemap & finitions** | Lots 4-5 | Iframe Bubblemaps affichée (validée) + lien externe permanent ; sens métier par indicateur ; « non couvert » propre pour snipers/phishing |
| **J5 — Itérations** | Lot 6 | Selon priorisation (score agrégé, natif, historique…) |

---

## 5. Risques & mitigation

| Risque | Prob. | Impact | Mitigation |
|--------|-------|--------|-----------|
| ~~R1 — CORS RugCheck bloque le fetch client~~ | — | — | **Levé (2026-07-19)** : CORS confirmé permissif, plus aucune mitigation requise |
| R2 — Snipers/Phishing sans source gratuite exploitable (GMGN bloqué par anti-bot ; Deepnets a une API mais payante en x402) | Certaine (confirmé 2026-07-19) | Deux indicateurs demandés non intégrés | Afficher « non couvert » + renvoi GMGN (T21) ; ne rien inventer (RG-04) ; ne pas contourner l'anti-bot GMGN ni intégrer de paiement x402 |
| ~~R3 — Iframe Bubblemaps bloquée/payante~~ | — | — | **Levé (2026-07-19)** : iframe testée en navigateur réel, aucune mitigation requise |
| ~~R4 — Format `risks[]` inconnu~~ | — | — | **Levé (2026-07-19)** : testé sur ~60 tokens réels, schéma confirmé (voir spec technique §4.1) |
| ~~R5 — URLs GMGN/Deepnets erronées~~ | — | — | **Levé (2026-07-19)** : les deux formats confirmés et mis à jour dans le code (T15/T16) |
| R6 — Rate limit tiers ponctuel | Faible | Analyse en erreur ponctuelle | Un appel/analyse manuelle (pas de polling) ; `apiError.ts` gère 429 ; relance manuelle |

---

## 6. Estimation globale (indicative)

MVP (Lots 0-3, hors Should/Could) ≈ **2 M + 8 S** (T04 sorti du backlog, déjà résolu). Léger : une
seule page cliente, deux sources `fetch` sans clé, aucune infra ni secret, aucune nouvelle
dépendance npm. Le principal aléa n'est pas l'effort de code mais la **validation des sources
externes** (URLs GMGN/Deepnets, format `risks[]`) — d'où les spikes P2-P4 placés tôt ; P1 (CORS)
et P5 (iframe Bubblemaps) sont déjà levés.
