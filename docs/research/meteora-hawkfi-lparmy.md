# Meteora, Hawkfi & LP Army — état des lieux et piste de paper trading

Recherche exploratoire (2026-07-22) sur l'écosystème Meteora pour évaluer ce qui est
programmable (création de pools, automation) et si un système de paper trading est réaliste
avant d'y consacrer du dev. Ce document n'est pas une spec — voir `docs/specs/` pour le format
utilisé quand une fonctionnalité passe en implémentation.

## 1. Meteora (https://app.meteora.ag/)

Meteora regroupe plusieurs produits distincts, à ne pas confondre :

| Produit | Rôle | Notes |
|---|---|---|
| **DLMM** | AMM à liquidité concentrée par "bins" (prix discrets), frais dynamiques selon la volatilité | Le plus flexible, déjà notre source pour `PoolsPage.tsx` |
| **Dynamic AMM (DAMM v2)** | Pool full-range classique (constant-product), programme on-chain séparé de v1, ne dépend plus des Dynamic Vaults | Plus simple, création ~90% moins chère que DLMM |
| **Dynamic Vaults** | Rebalance le capital entre protocoles de lending pour du yield passif (~1x/min) | Utilisé en interne par DAMM v1, pas pertinent pour du LP actif |

Sources : [Différences DLMM vs Dynamic Pools](https://docs.meteora.ag/getting-started/difference-between-dlmm-and-dynamic-pools), [Dynamic AMM FAQ](https://docs.meteora.ag/user-faq/dynamic-amm-faq), [Meteora V2 vs V1](https://medium.com/@webrin/meteora-v2-vs-v1-everything-new-improved-9ead0992777a)

### Créer un pool par programmation : oui, via SDK on-chain (pas de REST)

- Package npm `@meteora-ag/dlmm` (+ `@solana/web3.js`).
- `createLbPair` / `createLbPair2` (la v2 gère Token-2022 et des base fees plus élevées via
  `PresetParameter2`).
- Paramètres configurables : `binStep` (pas de prix en bps, ex. `400` = 4% entre bins deux
  consécutifs), base fee (bps), `initialPrice`, `activationType` (`0` = Slot, `1` = Timestamp),
  `activationPoint`. Côté gestion de position (pas création de pool) : `StrategyType.Spot`,
  `BidAsk`, `Curve` pour la distribution de liquidité.
- La création est une **transaction on-chain signée**, pas un appel REST. L'API REST publique
  (type `dlmm.datapi.meteora.ag`, déjà utilisée dans ce repo) est en lecture seule.
- Coût : DLMM ≈ 0,25 SOL (bin arrays + position) + ~0,059 SOL de rent de position (récupérable à
  la fermeture) ; DAMM v2 ≈ 0,022 SOL (~90% moins cher).

Sources : [TS SDK — Getting Started](https://docs.meteora.ag/developer-guides/dlmm/typescript-sdk/getting-started), [npm @meteora-ag/dlmm](https://www.npmjs.com/package/@meteora-ag/dlmm), [GitHub dlmm-sdk](https://github.com/MeteoraAg/dlmm-sdk), [exemple de config](https://github.com/MeteoraAg/meteora-invent/blob/main/studio/config/dlmm_config.jsonc), [coûts de création](https://medium.com/@solfanclub/understanding-liquidity-pool-mechanisms-on-meteora-916173daa641)

> La référence exhaustive des paramètres de `createLbPair` est dans
> `/developer-guides/dlmm/typescript-sdk/reference` (page non accessible telle quelle lors de
> cette recherche — à consulter directement si on implémente la création réelle).

## 2. Hawkfi (https://www.hawkfi.ag/)

Ce n'est **pas** un concurrent de Meteora : Hawkfi (ex-Hawksight) est une **couche d'automatisation
self-custodial** au-dessus de Meteora DLMM (et aussi Orca Whirlpools, Raydium CLMM). Les positions
créées via Hawkfi sont littéralement des positions DLMM Meteora, juste gérées automatiquement —
l'utilisateur garde le contrôle de ses fonds (pas de vault centralisé).

Fonctionnalités clés :
- auto-compound, auto-rebalance (up-only / down-only / both directions)
- auto TP/SL
- **"High Frequency Liquidity"** : ranges très serrés (6-12 bins) rebalancés en continu sans swap
- **"Ping Pong DLMM"** : positions asymétriques pour parier sur une direction de prix

SDK : package npm `@hawksightco/hawk-sdk` — TypeScript, gère positions/transactions/automation/
monitoring sur Meteora/Orca/Raydium/Jupiter de façon unifiée. Donc programmable, pas juste UI.

Sources : [Whitepaper — What is HawkFi](https://hawkfi.gitbook.io/whitepaper/master), [Hawksight → HawkFi](https://hawksight.medium.com/hawksights-transformation-to-hawkfi-hfi-points-program-90dc0f6034c3), [npm @hawksightco/hawk-sdk](https://www.npmjs.com/package/@hawksightco/hawk-sdk), [High Frequency Liquidity](https://hawkfi.gitbook.io/whitepaper/hawkfi-or-fee-superiority/high-frequency-liquidity), [Ping Pong DLMM](https://hawkfi.gitbook.io/whitepaper/hawkfi-cook-book/ping-pong-dlmm)

## 3. LP Army (https://www.lparmy.com/)

Hub **communautaire et éducatif** autour du LP sur Meteora — satellite non officiel, pas un
produit Meteora. Contenu : Academy multi-niveaux/multilingue, 50+ guides de stratégie avec données
de perf réelles, glossaire complet, et un annuaire de 15+ outils tiers (UltraLP, Liquid Nova,
Tokleo, MetEngine, Rocket Scan, DLMM Alert, Metlex...).

Point le plus intéressant pour nous : la section **`/playground`** ("DLMM Playground") permet de
tester/optimiser des stratégies sur n'importe quel pool réel (distribution de liquidité réelle,
pools à frais en quote token, limit orders) de façon "risk-free". Son fonctionnement exact
(simulation pure vs visualisation en temps réel sur pool live) n'a pas pu être confirmé en détail —
à tester directement dans le navigateur si on veut s'en inspirer. Aucune API publique identifiée.

Rôle dans l'écosystème : LP Army = couche pédagogique pour *choisir* les bons paramètres
(bin step, range, stratégie) ; Meteora = infrastructure on-chain pour créer/gérer le pool ; Hawkfi
= automatisation de la gestion post-création.

Sources : [lparmy.com](https://www.lparmy.com/), [Academy](https://www.lparmy.com/academy), [Genfinity — Meteora's LP Army](https://genfinity.io/2026/06/08/meteora-lp-army-solana-liquidity-education/)

## 4. Paper trading — faisabilité

Aucun outil clé-en-main de **backtesting historique** (P&L simulé sur données de prix/volume
passées, sans toucher la chaîne) n'a été trouvé pour DLMM. Le "DLMM Playground" de LP Army est ce
qui s'en approche le plus, mais semble opérer sur des pools réels en temps réel plutôt que sur du
rejeu historique — ce n'est pas exactement la même chose.

**Ce qui rend un simulateur maison réaliste :**
- Toutes les données nécessaires sont déjà accessibles en lecture seule, sans dépenser de fonds :
  OHLCV/volume via GeckoTerminal (déjà utilisé dans `indicator-alerter/`), état des pools DLMM
  (bin step, fee, TVL) via l'API REST Meteora (déjà utilisée dans `PoolsPage.tsx`).
- Le P&L d'une position DLMM se calcule de façon déterministe côté client : frais collectés par
  bin (proportionnels au volume qui traverse chaque bin pondéré par la part de liquidité qu'on y
  détient) moins l'impermanent loss vs hold, en fonction de la distribution de liquidité choisie
  (Spot/BidAsk/Curve) et du range.
- **Aucune transaction on-chain n'est requise** pour ça — pas besoin du SDK `@meteora-ag/dlmm`
  pour signer quoi que ce soit, juste pour éventuellement lire ses paramètres de référence
  (bin step, presets de fee) si on veut coller aux vraies configs possibles.

**Proposition de shape (à discuter avant tout dev) :** une page "Paper Trading" dans la SPA où
l'utilisateur choisit un pool existant (ou un mint), une plage de bins, un montant virtuel et une
stratégie de distribution, puis rejoue l'historique récent (via GeckoTerminal OHLCV) pour afficher
un P&L simulé (fees gagnées vs IL) — sur le même principe que les autres pages : pas de backend,
tout côté client, polling/fetch direct des APIs publiques.

C'est une piste, pas un plan arrêté — dis-moi si tu veux qu'on la transforme en vraie spec
(`docs/specs/paper-trading/...`, format des 3 fichiers comme pour `token-scanner`) ou qu'on
prototype directement une première version simple.
