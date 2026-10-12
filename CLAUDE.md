# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start the Vite dev server with HMR
- `npm run build` — type-check (`tsc -b`) then produce a production build; the build fails on any TypeScript error. `tsconfig.json` references the SPA *and* both Node services (`tsconfig.alerter.json`, `tsconfig.indicator-alerter.json`), so a type error in `alerter/` or `indicator-alerter/` also breaks the build. `npx tsc -b` alone is the quickest full type-check.
- `npm run lint` — run ESLint over the repo. **It currently fails on pre-existing errors** in five
  pages (`react-hooks/set-state-in-effect` in Filter/Gecko/DexScreener/SolanaTracker/Pools pages,
  `react-hooks/purity` in `FilterPage.tsx`); lint the files you touch with `npx eslint <paths>`.
- `npm run preview` — serve the production build locally
- `npm run alerter` — run the Meteora new-pool alerting service (see below); polls continuously until killed
- `npm run indicator-alerter` — run the technical-indicator exit-signal (take-profit) alerting service (see below); polls continuously until killed
- `npm run watchlist-api` — run the local Java watchlist service (see below) on `127.0.0.1:8080`
- `npm run up` — run `dev`, `indicator-alerter` and `watchlist-api` together (`concurrently`, prefixed logs; when one exits the others are stopped)

Tests:
- `npm test` — Node's built-in `node:test` runner (no extra dependency) over
  `indicator-alerter/**/*.test.ts` and `src/**/*.test.ts`; run one file with
  `node --test path/to/file.test.ts`. Test files in `src/` are type-checked by `tsconfig.node.json`
  (Node types) and excluded from `tsconfig.app.json`; only pure modules are tested this way (no
  React rendering tests).
- `cd watchlist-api && .\mvnw.cmd test` — JUnit 5 tests of the Java service; one class with
  `-Dtest=WatchlistServiceTest`.

## Architecture

A single-page React 19 + TypeScript + Vite app for scouting Solana tokens and Meteora DLMM liquidity pools. Everything runs client-side in the browser — there is no backend; the app calls third-party crypto APIs directly with `fetch`.

`src/App.tsx` sets up `react-router-dom` with eight routes (`/filter`, the default, `/gecko`, `/dexscreener`, `/solanatracker`, `/pools`, `/scanner`, `/watchlist`, `/lp`) plus a top nav (`NAV_ITEMS`). Each route is a self-contained page component under `src/pages/` that owns its own data-fetching, polling, loading/error state, and rendering. There is no shared state or store between pages — shared code lives only in `src/lib/` — treat each page as an independent unit otherwise. The SPA has no backend of its own; the one exception is `/watchlist`, which talks to the local `watchlist-api` service through a Vite proxy (see below).

- **`src/pages/FilterPage.tsx`** — queries the Birdeye API (`public-api.birdeye.so`) for Solana tokens filtered by hard-coded thresholds (`MIN_VOLUME_5M`, `MAX_MARKET_CAP`), auto-refreshing every 30s. Requires the Birdeye API key (see below). Note: its default export is named `App`, but it is the Filter page, not the root component.
- **`src/pages/GeckoTerminalPage.tsx`** — queries the GeckoTerminal API (`api.geckoterminal.com`) for Solana pools sorted by 24h volume server-side, then filters/sorts by 5m volume client-side (the API has no native 5m sort). No API key required. Polls every 30s.
- **`src/pages/DexScreenerPage.tsx`** — queries the DexScreener search endpoint (`api.dexscreener.com`) with several hard-coded queries (`SEARCH_QUERIES`), since DexScreener has no "global list" endpoint; results are deduplicated, filtered, and sorted by 5m volume client-side. No API key required. Polls every 30s.
- **`src/pages/SolanaTrackerPage.tsx`** — queries the Solana Tracker Data API (`data.solanatracker.io/tokens/trending/5m`). Requires `VITE_SOLANATRACKER_API_KEY`; renders a setup-instructions screen instead of fetching when the key is missing. Polls every 30s.
- **`src/pages/PoolsPage.tsx`** — polls the Meteora DLMM data API (`dlmm.datapi.meteora.ag/pools`) for the newest pools every 15s, sorted by creation time.
- **`src/pages/TokenScannerPage.tsx`** — paste-a-CA risk scanner, analyzed on demand (no polling). Fetches RugCheck (`api.rugcheck.xyz/v1/tokens/{mint}/report`) for the global risk score, insiders, mint/freeze authority and LP lock (derived from `report`'s `markets[]`, since `lpLockedPct` only exists at the top level on `/report/summary`, not `/report`), and DexScreener orders for the "Dex Paid" badge; GMGN/Deepnets/RugCheck/DexScreener are external links only (no free structured API), Bubblemaps is an embedded iframe. Each source is isolated per `BlockState` (idle/loading/ok/unknown/error) so one failing source never blocks the others. Also computes an explicitly-labeled experimental aggregate score (weighted RugCheck score/authorities/LP-lock/insiders, floored if RugCheck flags a `danger`-level risk) and keeps a `localStorage`-backed history/favorites of analyzed CAs. No API key required. Full spec: `docs/specs/token-scanner/`. `/scanner?ca=<CA>` fills the field and starts the analysis on load (used by the Choix LP tab's links); invalid values are ignored (`caFromSearch`).
- **`src/pages/WatchlistPage.tsx`** — manages the `indicator-alerter` watchlist: lists tokens with their watch status, adds (CA validated client-side), renames inline, removes with an in-row confirmation, and shows banners for an unreachable service / inactive alerter. Calls `/api/watchlist` (proxied by Vite to `watchlist-api`); polls every 30s. Spec: `docs/specs/watchlist-web/PLAN.md`.
- **`src/pages/LpPickerPage.tsx`** (`/lp`, « Choix LP ») — helps pick which Meteora DLMM pool to LP on, per **technique** chosen in a selector: **one technique = one separate list** (explicit user decision). v1 has one technique, Vladimir's rules. Shows a CA lookup (every DLMM pool of the token with a ✅ conforme / 🟡 proche / ❌ hors règle verdict and reasons; non-SOL pairs flagged) and an automatic list of SOL-pair tokens ranked by 24h volume, refreshed every 60s, with security links (Bubblemaps, Deepnets, RugCheck, scanner). Calls the Meteora API directly; read-only. Spec: `docs/specs/lp-picker/PLAN.md`.
- **`src/lib/lp/`** — the tab's pure, tested logic. `meteoraPools.ts`: API types and fetches (`sort_by=volume_24h:desc` — `volume.24h` returns nothing; `query=<CA>` is a fuzzy search, so `poolsForMint` re-filters on the exact mint), SOL-pair detection on either side, the auto-list filter (not blacklisted, market cap ≥ 100k, `MAJOR_MINTS` excluded **by mint, never by symbol**). `vladimir.ts`: the market-cap rule (< 1M: fee ≥ 2 %, bin step 125–200; ≥ 1M: fee 0.2–1 %, bin step 20–50; 20 % tolerance; both rules accepted between 0.8M and 1.2M) and `bestPool`. `techniques.ts`: the `Technique` interface — `evaluate(pool, token)` takes the evaluated token explicitly (never infer it from token_x/token_y order). `registry.ts`: the selector's list; adding a technique = a new file + one registry line. `minuteVolume.ts`: 1-min / 5-min volume per pool from GeckoTerminal minute candles (Meteora's finest window is 30m); **every GeckoTerminal call of the tab goes through its single queue** (1 call / 2.5 s, priority CA > expanded rows > list, 60 s cache, 30 s pause on 429 — and on network errors, because GeckoTerminal's 429 has no CORS header and surfaces in the browser as a failed fetch); the limit is shared with `indicator-alerter`. Tests use frozen real responses in `fixtures/`.
- **`src/lib/solanaAddress.ts`** — `isValidSolanaAddress` (base58 + exactly 32 decoded bytes), shared by the scanner and the watchlist page; `watchlist-api`'s `SolanaAddress.java` applies the same rule.
- **`src/lib/watchlist.ts`** — types of the watchlist API contract and the page's pure helpers (status labels, candle time, `readWatchlistError`, which tells an unreachable service — proxy 5xx without an `{error,message}` body — from a business error).
- **`src/lib/apiError.ts`** — shared helper used by every token-listing page to turn a failed `fetch` `Response` into a readable `ApiFailure` (`readApiFailure`) and display string (`formatApiFailure`), distinguishing quota/auth/rate-limit/server-error causes from the HTTP status and response body. It is also imported by the Node services (`alerter/poolFetcher.ts`, `indicator-alerter/ohlcvClient.ts`, `poolResolver.ts`) and compiled under their tsconfigs (`lib: ["ES2023"]`, no DOM), so it must stay free of browser-only APIs and `import.meta.env`.

Common conventions across pages: filter/threshold constants are `const`s at module top, `formatAge()` converts Unix-second timestamps to human strings, polling is a `setInterval` inside a `useEffect` cleaned up on unmount, and UI uses the shared CSS classes of `src/index.css` / `src/App.css` (`page`, `page-header`, `data-table`, `alert alert-error|alert-warn`, `btn`, `badge`, `scan-input`, `link-btn`…; no CSS framework). UI text is in French. `TokenScannerPage.tsx` is the one exception to polling: it's a manual, on-demand lookup (button/Enter, `AbortController` per analysis) rather than an interval.

## Alerting service (`alerter/`)

Alongside the SPA, `alerter/` is a standalone Node script — not part of the Vite app, not routed,
not bundled by Vite (only type-checked, via `tsconfig.alerter.json`). It polls the same
Meteora DLMM pools endpoint used by `PoolsPage.tsx` on an interval, diffs the results against a
locally persisted set of previously-seen pool addresses (`alerter/.state/seen-pools.json`,
gitignored), and pushes an alert to Discord and/or Telegram for every genuinely new pool. Run it
with `npm run alerter`; it uses Node's native TypeScript execution and `--env-file=.env` (no
build step, no extra dependencies). Because Node only strips types, code in both Node services
must import relative modules with an explicit `.ts` extension (`./config.ts`) and avoid
non-erasable syntax (enums, namespaces, constructor parameter properties) — enforced by
`erasableSyntaxOnly` in their tsconfigs.

The **first run** against an empty state file is a silent bootstrap: it registers all currently
known pools without alerting, so restarting the service never floods the channels with a backlog
(see `alerter/diffDetector.ts`). Notification channels (`discordNotifier`/`telegramNotifier` in
`alerter/notifier.ts`) are sent in parallel and isolated from each other — a failure on one never
blocks the other. Full spec, rationale, and open questions: `docs/specs/meteora-pool-alerts/`.
There is a second, unimplemented spec for a Supertrend-flip Telegram alert at
`docs/specs/telegram-alerts/` — unrelated code, do not conflate the two.

## Technical-indicator alerting service (`indicator-alerter/`)

Another standalone Node/TypeScript script, same shape as `alerter/` (not part of the Vite app,
type-checked only via `tsconfig.indicator-alerter.json`, no build step, run with
`npm run indicator-alerter`). It watches a **user-maintained watchlist** of Solana token mints —
`indicator-alerter/watchlist.json` (gitignored; copy `watchlist.example.json` to start; a plain
JSON array of `{ "mint": "...", "label"?: "..." }` or bare mint strings, re-read every cycle so
adding/removing a CA takes effect without a restart) — and sends a Discord/Telegram alert
(reusing the same `ALERT_CHANNELS`/`DISCORD_WEBHOOK_URL`/`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`
config as `alerter/`) when a combo **exit signal** fires on a 15-minute candle — the **in-progress**
candle included (see below). These
are **take-profit / exit signals on a bullish overextension, not entry signals**: the watchlist
holds tokens the user is already in, and there is deliberately no entry signal and no position
tracking (explicit product decision; the alert is titled « 🔴 SIGNAL DE SORTIE »). Visual
reference of the signals: `docs/specs/img_1.png`. At least 2 of these 3 must trigger on the same
candle (`indicator-alerter/signalDetector.ts`, `REQUIRED_SIGNALS`) —

- **Bollinger (20, 2)** breakout: close crosses above the upper band — measured on the **close,
  never the wick/high** (explicit user decision; a wick poking above the band does not count).
- **MACD (12, 26, 9 on close)**: histogram crosses from ≤0 (red) to >0 (green) — i.e. the MACD
  line crosses above its signal line.
- **RSI(2)**: crosses above 90 (extreme overbought, not the oversold-bounce interpretation).

Candles come from GeckoTerminal's free OHLCV endpoint (`api.geckoterminal.com`, no key), which is
per-*pool* not per-mint, so `poolResolver.ts` resolves each watchlist mint to its most-liquid pool
once and caches it in state. `indicators.ts` holds the pure indicator math (SMA/stddev/EMA/Wilder
RSI); `ohlcvClient.ts` fetches candles and splits them into closed ones and the **in-progress**
candle (`CandleSet`), whose close is the live price. **Intrabar alerts** (user decision,
2026-10-09): every cycle (`INDICATOR_SCAN_INTERVAL_MS`, default **60 s** — it is now the maximum
delay between the combo appearing and the alert) evaluates the new closed candles *and* the
in-progress one, so an alert can fire before the close and the signal may vanish by then — the
message says « en cours, non clôturée ». This **replaces** the original rule « signals only on
closed candles (anti-repainting) », dropped for reactivity; don't restore it unknowingly.
`planCycle` (`signalDetector.ts`, pure, tested) holds every alerting rule: **one alert max per
candle** (`lastAlertedCandleTs` — seen intrabar, the candle stays silent at its close; a combo
only visible at the close still alerts), one alert on the latest qualifying candle when catching
up, and a **silent bootstrap** — a newly-added watchlist entry registers its state on the first
cycle without alerting, and if the combo already holds on the in-progress candle that candle is
marked as alerted, so it never fires immediately on a pre-existing condition. `stateStore.ts`
persists, per mint, the resolved pool, the last processed **closed** candle timestamp (the only
one `watchlist-api` reads; a closed candle is never re-evaluated) and `lastAlertedCandleTs`. Each cycle also
**purges the state of mints no longer in the watchlist** (`purgeRemovedTokens`, also when the
watchlist is empty), so a token removed then re-added bootstraps again instead of replaying old
candles; an invalid watchlist JSON throws *before* the purge and leaves the state untouched — keep
that order. A GeckoTerminal **404** on pool resolution means "no pool" (`resolveMostLiquidPool`
returns `null`), not an outage; other API errors still throw. Same on candles: only a **404**
makes the alerter forget the cached pool (re-resolved next cycle); a 429 keeps it, since a
re-resolution would cost one more call while rate-limited. GeckoTerminal's free tier is ~30
calls/min per IP and the `/lp` tab uses ~24 of them when open, so the alerter (1 OHLCV call per
token per cycle) logs `gecko_budget.exceeded` when it goes above ~6 calls/min
(`exceedsGeckoBudget`). Each watchlist entry
is processed in isolation (`Promise.allSettled` in `index.ts`) so one token's API failure never
blocks the others. A volume-spike signal was considered and explicitly dropped from scope.
Known gap: after a long alerter downtime, a token still in the watchlist replays the missed
candles and may alert once on an old signal (not handled; deleting `.state/state.json` before
restarting forces a silent bootstrap).

## Local watchlist service (`watchlist-api/`)

A small **Java 25 / Spring Boot 4.1** service (Maven wrapper, `spring-boot-starter-webmvc` only,
Jackson 3 — packages `tools.jackson.*`) backing the `/watchlist` page; Java was an explicit user
choice over a Node server. Run it with `npm run watchlist-api` (`.\mvnw.cmd spring-boot:run` from
`watchlist-api/`, Windows; `JAVA_HOME` must point to a JDK ≥ 17 — JDK 25 is installed). It binds
to **`127.0.0.1` only** (no auth, never exposed) on `WATCHLIST_API_PORT` (default 8080), rejects any
non-local `Host` header with 403 (`HostHeaderFilter`, a DNS-rebinding guard — keep it), and imports
the repo `.env` as a properties file (`spring.config.import`, so Windows paths there need `/`).

File ownership is the contract with the alerter — don't break it:
- it **writes** `indicator-alerter/watchlist.json` (atomic temp-file + rename, re-reading the file
  before every write so manual edits are not lost; refuses to write when the JSON is invalid);
- it only **reads** `indicator-alerter/.state/state.json`, which the alerter alone writes.

API (`/api/health`, `GET|POST /api/watchlist`, `PATCH|DELETE /api/watchlist/{mint}`): every error
is `{ "error": "<CODE>", "message": "<French text>" }`; `GET` returns the alerter's activity and a
per-token `WatchStatus` derived from `state.json`. Full design: `docs/specs/watchlist-web/PLAN.md`.

## Configuration

- `VITE_BIRDEYE_API_KEY` (required for `/filter`) — read via `import.meta.env.VITE_BIRDEYE_API_KEY`.
- `VITE_SOLANATRACKER_API_KEY` (required for `/solanatracker`) — the page degrades gracefully (setup instructions, no fetch) when absent.

Both are defined in `.env` at the repo root. Because they are `VITE_`-prefixed variables, they are embedded into the client bundle at build time and are not secret in production. New client-visible config must use the `VITE_` prefix to be exposed by Vite. GeckoTerminal, DexScreener, and Meteora require no API key.

The `alerter/` script reads its own config from the same `.env` file, but its keys must **never**
gain a `VITE_` prefix — they are server secrets, not client-visible config: `ALERT_CHANNELS`
(`discord`, `telegram`, or `discord,telegram`), `DISCORD_WEBHOOK_URL`, `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_CHAT_ID`, and optionally `SCAN_INTERVAL_MS`, `MIN_TVL_ALERT`, `EXCLUDE_BLACKLISTED`,
`SEEN_POOLS_MAX` (defaults documented in `.env.example`). `alerter/config.ts` refuses to start if
a channel listed in `ALERT_CHANNELS` is missing its required secret(s).

`indicator-alerter/` reuses the same `ALERT_CHANNELS`/`DISCORD_WEBHOOK_URL`/`TELEGRAM_BOT_TOKEN`/
`TELEGRAM_CHAT_ID` secrets (same validation rule as `alerter/config.ts`) plus its own optional,
non-conflicting vars: `INDICATOR_SCAN_INTERVAL_MS`, `INDICATOR_CANDLE_LIMIT`,
`INDICATOR_WATCHLIST_PATH`, `INDICATOR_STATE_FILE_PATH` (defaults in `.env.example`).
`watchlist-api/` reads those same `INDICATOR_*` paths and interval, plus `WATCHLIST_API_PORT`
(also read by `vite.config.ts` for the `/api` proxy, so both stay aligned).

## Specs and research (`docs/`)

Features are specified before implementation in **a single French document per feature,
`docs/specs/<feature>/PLAN.md`** (user decision, 2026-10-04 — "un seul plan pour le moment", whatever
the feature's size). It holds context and decisions, the rules not to break, the technical design,
the lots with their verification, and the risks — no formal user stories, no duplication. Example:
`docs/specs/watchlist-web/PLAN.md`.

**Plan mode → `PLAN.md`:** plan mode only lets Claude write its own plan file (under
`~/.claude/plans/`, outside the repo, lost to later sessions). So the plan written in plan mode *is*
the spec: as soon as the user approves it, the **first action is to copy it verbatim** to
`docs/specs/<feature>/PLAN.md`, and that copy is the reference from then on. Each `PLAN.md` states
its implementation status in its header; read it before touching the corresponding feature. Small
changes that need no plan record their durable decisions directly in code comments and in this file.

**Later plans on the same feature** (user decision, 2026-10-04): the "copy verbatim" rule applies to
the *first* plan only. A later plan-mode plan starts by reading the existing `PLAN.md` and describes
only the change (what, why, affected sections, lots, verification). Once approved, it is **merged**
into `PLAN.md`, never copied over it and never kept as a separate `PLAN-2.md`: update the affected
sections so the document always describes the feature's *current* state, bump the version and the
header status, and add a dated line to the **« Historique »** section at the top (what changed,
why). A superseded decision is never just deleted — it stays in the Historique with the reason it
changed, so nobody reverts it unknowingly.

The older specs `meteora-pool-alerts/`, `telegram-alerts/`, `token-scanner/` and `paper-trading/`
predate this rule and use three documents (`SPECIFICATION-FONCTIONNELLE.md`,
`SPECIFICATION-TECHNIQUE.md`, `PLAN-DE-MISE-EN-OEUVRE.md`); that format was never an explicit decision,
just the shape of the first spec (2026-07-17), copied afterwards. Leave them as they are until a new
plan touches one: that plan's merge step first **fuses the three documents into a single
`PLAN.md`** (as was done for `watchlist-web/`), then applies the change.

Implemented: `watchlist-web/PLAN.md` (the `/watchlist` page + `watchlist-api/`) and `lp-picker/PLAN.md` (the `/lp` tab, v1 = Vladimir's rules; Tiago, Evil panda and Quick in and out are planned as later techniques). Unimplemented
specs: `telegram-alerts/` (Supertrend flip) and `paper-trading/` (client-side DLMM LP P&L
simulator, fees vs impermanent loss replayed from history, targeting
`src/pages/PaperTradingPage.tsx` at `/paper-trading`). `docs/research/` holds exploratory notes
that are not specs (e.g. `meteora-hawkfi-lparmy.md`, the background for the paper-trading spec).
