# Plan — Choix des tokens à LP sur Meteora (onglet « Choix LP »)

> Un onglet **`/lp`** qui aide à choisir **sur quel pool DLMM Meteora fournir de la liquidité**, selon
> une **technique** choisie dans un sélecteur. Chaque technique produit **sa propre liste**. La version 1
> ne contient qu'une technique : les **règles de Vladimir** (choix du pool selon la market cap).
>
> Statut : **implémenté** (v2, 2026-10-07, branche `feat/lp-picker`) ; **v3 (volume 1 min) en cours**. Version 3 — 2026-10-07 (cf. Historique).
> Cibles : `src/pages/LpPickerPage.tsx`, `src/lib/lp/` (logique pure), `src/App.tsx` ; en option
> `src/pages/TokenScannerPage.tsx` (lecture de `?ca=`).

## Historique

| Version | Date | Changement | Pourquoi |
|---|---|---|---|
| v1 | 2026-10-06 | Plan initial, issu d'une séance de cadrage avec Enzo | Outiller l'étape « choisir le pool » de son workflow LP |
| v2 | 2026-10-07 | **Implémenté** (Lots 0 à 4, scanner `?ca=` compris). Écarts : registre des techniques dans `registry.ts` (et non `techniques.ts`) pour éviter un import circulaire ; `formatCompact` / `formatPct` dans `format.ts` ; lignes dépliées rendues en sous-tableau ; en cas d'échec du rafraîchissement, la liste garde ses dernières données sous le bandeau d'erreur ; `MAJOR_MINTS` relevé sur les 500 premiers pools (Q1 toujours à valider) | Constats d'implémentation ; l'aperçu du 2026-10-07 montre que la liste est dominée par les grosses capitalisations — Enzo a choisi d'implémenter tel quel et d'ajuster ensuite |
| v3 | 2026-10-07 | Ajout du **volume 1 min** (et 5 min) par pool, via les bougies minute de GeckoTerminal, dans la recherche par CA, les lignes dépliées **et la liste** (meilleur pool), avec une file d'attente commune limitée à 1 appel / 2,5 s (§11) | Demande d'Enzo. Meteora ne descend pas sous 30 min, DexScreener ne connaît pas tous les pools DLMM ; GeckoTerminal est la seule source minute, mais à un appel par pool et avec une limite partagée avec `indicator-alerter` |

---

## 1. Contexte & décisions

**Besoin.** Le workflow LP d'Enzo est : trouver un token (Padre, GMGN), vérifier sa sécurité
(Bubblemaps, Deepnets), **trouver le bon pool** (aujourd'hui Rocketscan), ouvrir la position sur
Meteora, puis suivre la sortie (alerteur `indicator-alerter`). L'onglet outille l'étape « trouver le
bon pool », et propose aussi une liste de tokens candidats.

**Sources lues pour le cadrage** (le 2026-10-06, via le Chrome d'Enzo) :
- son Google Doc « DLMM meteora » : onglets « Evil panda », « Quick in and out », « Outils ». Les
  signaux de sortie d'« Evil panda » sont ceux qu'implémente déjà `indicator-alerter` ;
- le fil X de @VladimirKovacs (28 sept. 2026), « comment être un LP rentable sur Meteora », posts 4/
  (token et pool), 5/ (forme), 6/ (sortie) ;
- l'article X de @tiiagoslb (24 sept. 2026), « comment je sélectionne mes runners » : repérage par les
  frais 24 h et la tendance, position hybride 1/3 Spot + 2/3 Bid-Ask, borne basse vers −70 %.

**Décisions d'Enzo (2026-10-06) :**
- **une technique = une liste séparée**, choisie dans un sélecteur ; pas de score qui mélange les
  techniques ;
- **version 1 = Vladimir seul**. Tiago, Evil panda et Quick in and out viendront ensuite, chacun par
  évolution de ce plan ;
- deux usages : une **liste automatique** et une **recherche par CA** ;
- liste automatique limitée aux **paires X-SOL hors majors**, market cap ≥ 100k ;
- **pas de suggestion automatique de forme** (Spot / Bid-Ask) : un simple rappel de la règle ;
- sécurité = **liens directs** vers les outils, sans appel API supplémentaire ;
- bornes de la règle **souples** : trois niveaux de verdict, tolérance de 20 % ;
- **approche A** : tout dans la page, appels directs à l'API Meteora, logique en modules purs testés,
  aucun backend.

**Inclus :** sélecteur de technique (une entrée), recherche par CA, liste automatique rafraîchie
toutes les 60 s, verdicts ✅/🟡/❌ avec raisons, liens Meteora / DexScreener / sécurité.

**Exclu (v1) :** les autres techniques ; suggestion de forme ou de range ; contrôles de sécurité
automatiques (RugCheck dans la liste, Bubblemaps…) ; alertes ; simulation de P&L (c'est
`docs/specs/paper-trading/`) ; ouverture de position (aucune transaction, aucun wallet).

---

## 2. Règles à ne pas casser

| # | Règle |
|---|---|
| RG-01 | **Une technique = une liste.** Une technique ne lit jamais le verdict d'une autre ; ajouter une technique ne modifie pas les listes existantes. |
| RG-02 | La règle de Vladimir s'applique au **token non-SOL** du pool et à **sa** market cap, telles que fournies par l'API Meteora. |
| RG-03 | Trois verdicts : **✅ conforme** (bornes exactes), **🟡 proche** (à moins de 20 % d'une borne), **❌ hors règle**. Tout verdict non ✅ affiche sa ou ses raisons en clair. |
| RG-04 | Toutes les bornes et la tolérance sont des **constantes en tête de `vladimir.ts`**. |
| RG-05 | La liste automatique ne montre que des **paires avec SOL**, hors **blacklist** Meteora, hors **majors** (§4.2), market cap ≥ **100k**. La recherche par CA montre **tous** les pools du token, paires non-SOL comprises (marquées). |
| RG-06 | La recherche par CA ne garde que les pools dont `token_x` ou `token_y` **est exactement** le CA saisi (le paramètre `query` de l'API est une recherche, pas un filtre exact). |
| RG-07 | Les deux blocs (recherche, liste) sont **isolés** : l'échec de l'un n'affecte pas l'autre. |
| RG-08 | Aucune écriture, aucune transaction, aucun wallet : l'onglet est **en lecture seule**. |

---

## 3. La technique « Vladimir »

### 3.1 Règle (validée le 2026-10-06)

| Market cap du token | ✅ Conforme | 🟡 Proche (tolérance 20 %) |
|---|---|---|
| **< 1M** | frais de base **≥ 2 %** et bin step **125–200** | frais ≥ 1,6 % et bin step 100–240 |
| **≥ 1M** | frais de base **0,2–1 %** et bin step **20–50** | frais 0,16–1,2 % et bin step 16–60 |
| **0,8M–1,2M** (frontière) | — | **les deux** règles sont acceptées ; le meilleur des deux verdicts l'emporte |

- Frais de base = `pool_config.base_fee_pct` (en pourcent : `0.3` = 0,3 %). Bin step =
  `pool_config.bin_step`.
- Un pool est ✅ si **les deux** critères sont exacts ; 🟡 si les deux sont au moins « proches » et
  qu'au moins un ne l'est pas exactement ; ❌ sinon.
- Raisons affichées, par exemple : « bin step 100 hors de 20–50 (règle ≥ 1M) », « frais 1,8 %, proche
  du minimum 2 % ».
- Origine (post 4/ de Vladimir) : « sous les 1M de marketcap : base fees de 2 % minimum (les 3 %–5 % ou
  même 10 % font le taf), bin step plus larges genre 125–200 » ; « au-dessus de 1M : 1 %, 0,8 %, etc.,
  parfois bin step 50 ou même la fameuse 20/0,2 ».

### 3.2 Liste et classement

- Une ligne par **token**, triée par **volume 24 h** (somme des volumes 24 h de ses pools SOL retenus
  dans les 200 pools chargés).
- Colonnes : token (symbole, CA abrégé copiable), market cap, volume 24 h, nombre de pools ✅ et 🟡,
  **meilleur pool** (le ✅ au plus fort volume 24 h, sinon le 🟡 au plus fort volume), liens.
- Ligne dépliable : tous ses pools SOL avec bin step, frais de base, TVL, volume et frais 24 h,
  verdict et raisons.
- Par défaut, seuls les tokens ayant au moins un pool ✅ ou 🟡 ; case « afficher aussi les tokens sans
  pool retenu ».
- Rappel fixe sous le sélecteur : « Forme : Spot pour un coup rapide, Bid-Ask pour un token établi
  (memecoin qui a fait ses preuves). »

### 3.3 Exemple de référence : HIGGS

CA `DoVAVzViX8Bjy3r15nwikSaSbzE6dV4ovd28aWpJpump`, market cap ≈ 2,3M (2026-10-06), donc règle ≥ 1M.
Ses pools SOL : bin step 100 avec 0,3 %, 5 % ou 2 % de frais → **tous ❌** (100 dépasse même la borne
souple de 60). Son pool bin step 50 / 0,5 % est appairé à **USDC** : il n'apparaît que dans la recherche
par CA, marqué « paire non-SOL », avec le verdict ✅. Ce cas sert de test sur données réelles (§8).

---

## 4. Données (API Meteora, sans clé)

Endpoint de base : `https://dlmm.datapi.meteora.ag/pools` (déjà appelé depuis le navigateur par
`PoolsPage.tsx`, donc CORS confirmé).

### 4.1 Appels

| Usage | Requête | Constaté le 2026-10-06 |
|---|---|---|
| Liste automatique | `?page=1&page_size=200&sort_by=volume_24h:desc` | ~0,2 s ; 200 pools → 131 paires SOL → ~110 pools candidats → ~74 tokens. `page_size=500` fonctionne aussi (~1 s). |
| Recherche par CA | `?page=1&page_size=50&query=<CA>` | HIGGS → 10 pools. Filtrer ensuite sur l'égalité exacte du mint (RG-06). |

`sort_by=volume.24h:desc` ne fonctionne **pas** (liste vide) : utiliser `volume_24h`.

### 4.2 Champs utilisés et filtres

Champs : `address`, `name`, `token_x` / `token_y` (`address`, `symbol`, `market_cap`), `pool_config`
(`bin_step`, `base_fee_pct`), `tvl`, `volume["24h"]`, `fees["24h"]`, `is_blacklisted`, `created_at`.

- **Paire SOL** : `token_x` **ou** `token_y` vaut le wrapped SOL
  `So11111111111111111111111111111111111111112` ; le « token » est l'autre côté.
- **Majors exclus** (constante `MAJOR_MINTS`, liste à confirmer au Lot 0, cf. P1) : stablecoins (USDC,
  USDT…), SOL liquides (JitoSOL, mSOL, bSOL, JupSOL…), BTC et ETH wrappés (cbBTC, WBTC, WETH…), gros
  tokens établis (JUP, JTO, PYTH…). Exclusion **par mint**, pas par symbole : un memecoin dont le symbole
  contient « SOL » ou « USD » ne doit pas disparaître.
- Market cap ≥ `MIN_MARKET_CAP = 100_000` ; `is_blacklisted === false`.

---

## 5. Architecture (approche A)

```
src/lib/lp/
├── meteoraPools.ts        types de l'API, appels, filtres (paire SOL, majors, blacklist, market cap),
│                          regroupement par token — pur sauf les deux fonctions fetch
├── meteoraPools.test.ts
├── techniques.ts          interface commune + registre des techniques (v1 : Vladimir)
├── vladimir.ts            règle §3.1, constantes RG-04, choix du meilleur pool
└── vladimir.test.ts
src/pages/LpPickerPage.tsx affichage seul : sélecteur, recherche par CA, liste, liens
```

Interface commune (esquisse) :

```ts
export type VerdictLevel = "conforme" | "proche" | "hors-regle";

export interface PoolVerdict {
    level: VerdictLevel;
    reasons: string[]; // vide si conforme
}

export interface Technique {
    id: string;          // "vladimir"
    label: string;       // "Règles de Vladimir"
    reminder: string;    // rappel affiché sous le sélecteur
    evaluate(pool: MeteoraPool, token: PoolToken): PoolVerdict;
}
```

Ajouter Tiago plus tard : un fichier `tiago.ts` qui implémente `Technique` (et ses propres données si
besoin), inscrit dans le registre. Rien d'autre ne change (RG-01).

Conventions reprises : classes CSS partagées (`page`, `data-table`, `alert`, `btn`, `scan-input`,
`badge`…), textes en français, `isValidSolanaAddress` de `src/lib/solanaAddress.ts` pour la saisie,
`readApiFailure` / `formatApiFailure` pour les erreurs, premier chargement de l'effet dans un
`setTimeout(…, 0)` et pas de `Date.now()` pendant le rendu (règles de lint React, comme
`WatchlistPage.tsx`).

---

## 6. Page `/lp`

- **Navigation** : `{ to: "/lp", label: "Choix LP" }` dans `NAV_ITEMS`, route dans `src/App.tsx`.
- **Sélecteur** : une entrée en v1 (« Règles de Vladimir ») + son rappel de forme.
- **Recherche par CA** : champ + bouton (et Entrée) ; validation locale ; tableau de tous les pools du
  token (RG-06) avec verdict et raisons ; paires non-SOL marquées ; liens pool Meteora
  (`https://app.meteora.ag/dlmm/<pool>`) et DexScreener (`https://dexscreener.com/solana/<pool>`).
  Aucun pool trouvé → « Aucun pool DLMM Meteora pour ce token ».
- **Liste automatique** : chargement au montage, puis toutes les **60 s**, bouton « Rafraîchir »,
  heure de dernière mise à jour, case « afficher aussi les tokens sans pool retenu ».
- **Liens de sécurité par token** : Bubblemaps `https://app.bubblemaps.io/sol/token/<CA>`, Deepnets
  `https://deepnets.ai/token/<CA>`, RugCheck `https://rugcheck.xyz/tokens/<CA>`, et le scanner interne
  (`/scanner`, ou `/scanner?ca=<CA>` si le Lot 3 optionnel est fait).
- **Erreurs** : un bandeau par bloc (RG-07), message issu de `formatApiFailure`.

---

## 7. Lots

| Lot | Contenu | Priorité | Vérification |
|---|---|---|---|
| 0 | `meteoraPools.ts` (types, filtres, regroupement), `techniques.ts`, `vladimir.ts` + tests ; confirmation de `MAJOR_MINTS` (P1) | Must | `npm test` : bornes exactes et souples, frontière 0,8M–1,2M, raisons, meilleur pool, paire SOL dans les deux sens, majors, blacklist, jeu de données réel figé (HIGGS) |
| 1 | Page `/lp` : navigation, sélecteur, recherche par CA | Must | `npx tsc -b`, eslint des fichiers touchés ; dans Chrome : HIGGS (pools ❌ + pool USDC ✅ marqué non-SOL), CA invalide, CA sans pool |
| 2 | Liste automatique : chargement, 60 s, case, lignes dépliables | Must | Dans Chrome : liste non vide, aucun major ni stable, tri par volume, dépliage ; API coupée (bloquer la requête) → bandeau dans ce bloc seulement |
| 3 | Liens de sécurité ; option : le scanner lit `?ca=` et lance l'analyse | Must (liens) / Could (scanner) | Clic sur chaque lien → bon outil sur le bon CA |
| 4 | `CLAUDE.md` (route, page, `src/lib/lp/`), statut et Historique de ce plan | Must | Relecture |

**Validation métier** (fin du Lot 2) : Enzo compare 2 ou 3 tokens de la liste avec le pool qu'il
aurait choisi à la main en appliquant la règle de Vladimir.

---

## 8. Tests

- `src/lib/lp/vladimir.test.ts` : chaque borne de part et d'autre (1M, 0,8M, 1,2M ; 2 %, 1,6 % ;
  0,2 %, 0,16 % ; 1 %, 1,2 % ; 125, 100 ; 200, 240 ; 20, 16 ; 50, 60), combinaisons d'un critère exact
  et d'un critère proche, raisons, choix du meilleur pool (✅ avant 🟡, puis volume).
- `src/lib/lp/meteoraPools.test.ts` : SOL en `token_x` et en `token_y`, majors exclus par mint (et un
  memecoin au symbole contenant « SOL » conservé), blacklist, seuil 100k, regroupement et somme des
  volumes, filtre exact de la recherche par CA (RG-06).
- **Jeu de données réel figé** : un extrait de réponse Meteora du jour (dont les pools de HIGGS) dans
  `src/lib/lp/fixtures/`, pour vérifier les verdicts sur de vrais pools.
- Pas de test de rendu React (convention du projet) : la page est vérifiée dans Chrome (Lots 1-2).

---

## 9. Prérequis et risques

| # | Prérequis / risque | Traitement |
|---|---|---|
| P1 | Liste `MAJOR_MINTS` exacte | Au Lot 0 : relever, dans les 500 premiers pools par volume, les tokens établis et leurs mints réels ; Enzo valide la liste |
| R1 | L'API Meteora n'est pas documentée publiquement (paramètres `sort_by`, `query` constatés à l'usage) | Constantes d'URL en tête de `meteoraPools.ts` ; bandeau d'erreur explicite si le format change |
| R2 | Market cap Meteora approximative ou absente (`0`) sur certains tokens | Market cap absente ou nulle → token écarté de la liste, verdict « market cap inconnue » dans la recherche par CA |
| R3 | Volume de la ligne calculé seulement sur les pools présents dans les 200 chargés | Limite assumée et indiquée en info-bulle ; `page_size` en constante |
| R4 | Limite de requêtes de l'API | Un seul appel par minute pour la liste ; la recherche par CA est manuelle |

---

## 10. Questions ouvertes

| # | Question | Hypothèse en attendant |
|---|---|---|
| Q1 | La liste `MAJOR_MINTS` proposée au Lot 0 convient-elle ? | À valider par Enzo au Lot 0 |
| Q2 | Faut-il garder le Lot 3 optionnel (scanner via `?ca=`) ? | ✅ Fait (2026-10-07) |
| Q3 | La liste est dominée par les grosses capitalisations (tri par volume) : ajouter un plafond de market cap ou un filtre par tranche (< 1M, 1–10M, tout) ? | Non tranché — Enzo ajustera à l'usage |

---

## 11. Volume 1 min (v3)

**Source** : `GET https://api.geckoterminal.com/api/v2/networks/solana/pools/<pool>/ohlcv/minute?aggregate=1&limit=6&currency=usd`
(sans clé ; horodatage = **ouverture** de la bougie). Constaté le 2026-10-07 : Meteora ne fournit que 30m/1h/2h/4h/12h/24h,
et DexScreener ne connaît pas certains pools DLMM (ex. HIGGS-SOL `DQyGMA…`).

**Valeurs affichées** (`src/lib/lp/minuteVolume.ts`) :
- **Vol 1 min** = volume de la **dernière minute clôturée** ; la minute en cours est écartée (même règle anti-repaint
  que `indicator-alerter`) ;
- **Vol 5 min** = somme des 5 dernières minutes clôturées.

**File d'attente commune** (RG-09 ci-dessous) :
- **1 appel toutes les 2,5 s** au plus (~24/min), sous la limite gratuite (~30/min), car `indicator-alerter` appelle
  aussi GeckoTerminal depuis la même machine ;
- **priorité** : recherche par CA, puis lignes dépliées, puis meilleur pool de chaque token visible de la liste, dans
  l'ordre d'affichage ;
- **cache 60 s par pool** et dédoublonnage : le rafraîchissement de la liste réutilise les valeurs récentes ;
- **HTTP 429** : pause de 30 s, le pool est remis en file ; autre erreur HTTP : « — » avec info-bulle, gardé 60 s.
- **Erreur réseau = limite probable** (constaté le 2026-10-07) : le 429 de GeckoTerminal arrive **sans en-tête CORS**,
  donc dans le navigateur `fetch` lève une simple erreur réseau. Elle déclenche la même pause de 30 s ; sans ça, la
  file continuait d'appeler toutes les 2,5 s et entretenait le blocage.

**Affichage** : liste → colonne « Vol 1 min » (meilleur pool, « … » en attente, 5 min en info-bulle) ; recherche par CA
et lignes dépliées → colonnes « 1 min » et « 5 min ». La liste complète (~40 tokens) se remplit en ~1 min 30, du haut
vers le bas.

| # | Règle ajoutée |
|---|---|
| RG-09 | Tous les appels GeckoTerminal de l'onglet passent par **une seule file** ; jamais d'appel direct depuis la page. |

| Lot | Contenu | Vérification |
|---|---|---|
| 5 | `minuteVolume.ts` (lecture des bougies, file, cache, pause 429) + tests ; intégration dans la page | `npm test` (horloge et `fetch` simulés) ; Chrome : colonne qui se remplit, CA et ligne dépliée, 429 simulé → « — » et reprise |

**État du Lot 5 (2026-10-07)** : code et tests faits (48/48). Vérifié dans Chrome : colonnes présentes, file à
2,5 s, pause de 30 s sur échec. **Pas encore vérifié en réel : l'affichage d'une valeur**, car GeckoTerminal renvoyait
du 429 en continu ce soir-là (même via `curl`, file en pause). À refaire quand la limite est levée.
