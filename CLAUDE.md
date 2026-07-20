# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start the Vite dev server with HMR
- `npm run build` — type-check (`tsc -b`) then produce a production build; the build fails on any TypeScript error
- `npm run lint` — run ESLint over the repo
- `npm run preview` — serve the production build locally
- `npm run alerter` — run the Meteora new-pool alerting service (see below); polls continuously until killed
- `npm run indicator-alerter` — run the technical-indicator combo alerting service (see below); polls continuously until killed

There is no test runner configured in this project.

## Architecture

A single-page React 19 + TypeScript + Vite app for scouting Solana tokens and Meteora DLMM liquidity pools. Everything runs client-side in the browser — there is no backend; the app calls third-party crypto APIs directly with `fetch`.

`src/App.tsx` sets up `react-router-dom` with six routes (`/filter`, the default, `/gecko`, `/dexscreener`, `/solanatracker`, `/pools`, `/scanner`) plus a top nav (`NAV_ITEMS`). Each route is a self-contained page component under `src/pages/` that owns its own data-fetching, polling, loading/error state, and rendering. There is no shared state or store between pages — the only shared code is `src/lib/apiError.ts` — treat each page as an independent unit otherwise.

- **`src/pages/FilterPage.tsx`** — queries the Birdeye API (`public-api.birdeye.so`) for Solana tokens filtered by hard-coded thresholds (`MIN_VOLUME_5M`, `MAX_MARKET_CAP`), auto-refreshing every 30s. Requires the Birdeye API key (see below). Note: its default export is named `App`, but it is the Filter page, not the root component.
- **`src/pages/GeckoTerminalPage.tsx`** — queries the GeckoTerminal API (`api.geckoterminal.com`) for Solana pools sorted by 24h volume server-side, then filters/sorts by 5m volume client-side (the API has no native 5m sort). No API key required. Polls every 30s.
- **`src/pages/DexScreenerPage.tsx`** — queries the DexScreener search endpoint (`api.dexscreener.com`) with several hard-coded queries (`SEARCH_QUERIES`), since DexScreener has no "global list" endpoint; results are deduplicated, filtered, and sorted by 5m volume client-side. No API key required. Polls every 30s.
- **`src/pages/SolanaTrackerPage.tsx`** — queries the Solana Tracker Data API (`data.solanatracker.io/tokens/trending/5m`). Requires `VITE_SOLANATRACKER_API_KEY`; renders a setup-instructions screen instead of fetching when the key is missing. Polls every 30s.
- **`src/pages/PoolsPage.tsx`** — polls the Meteora DLMM data API (`dlmm.datapi.meteora.ag/pools`) for the newest pools every 15s, sorted by creation time.
- **`src/pages/TokenScannerPage.tsx`** — paste-a-CA risk scanner, analyzed on demand (no polling). Fetches RugCheck (`api.rugcheck.xyz/v1/tokens/{mint}/report`) for the global risk score, insiders, mint/freeze authority and LP lock (derived from `report`'s `markets[]`, since `lpLockedPct` only exists at the top level on `/report/summary`, not `/report`), and DexScreener orders for the "Dex Paid" badge; GMGN/Deepnets/RugCheck/DexScreener are external links only (no free structured API), Bubblemaps is an embedded iframe. Each source is isolated per `BlockState` (idle/loading/ok/unknown/error) so one failing source never blocks the others. Also computes an explicitly-labeled experimental aggregate score (weighted RugCheck score/authorities/LP-lock/insiders, floored if RugCheck flags a `danger`-level risk) and keeps a `localStorage`-backed history/favorites of analyzed CAs. No API key required. Full spec: `docs/specs/token-scanner/`.
- **`src/lib/apiError.ts`** — shared helper used by every token-listing page to turn a failed `fetch` `Response` into a readable `ApiFailure` (`readApiFailure`) and display string (`formatApiFailure`), distinguishing quota/auth/rate-limit/server-error causes from the HTTP status and response body.

Common conventions across pages: filter/threshold constants are `const`s at module top, `formatAge()` converts Unix-second timestamps to human strings, polling is a `setInterval` inside a `useEffect` cleaned up on unmount, and UI is inline-styled monospace tables (no CSS framework). UI text is in French. `TokenScannerPage.tsx` is the one exception to polling: it's a manual, on-demand lookup (button/Enter, `AbortController` per analysis) rather than an interval.

## Alerting service (`alerter/`)

Alongside the SPA, `alerter/` is a standalone Node script — not part of the Vite app, not routed,
not built by `npm run build` (only type-checked, via `tsconfig.alerter.json`). It polls the same
Meteora DLMM pools endpoint used by `PoolsPage.tsx` on an interval, diffs the results against a
locally persisted set of previously-seen pool addresses (`alerter/.state/seen-pools.json`,
gitignored), and pushes an alert to Discord and/or Telegram for every genuinely new pool. Run it
with `npm run alerter`; it uses Node's native TypeScript execution and `--env-file=.env` (no
build step, no extra dependencies).

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
config as `alerter/`) when a **combo signal** fires on a **closed** 15-minute candle: at least 2
of these 3 must trigger on the same candle (`indicator-alerter/signalDetector.ts`,
`REQUIRED_SIGNALS`) —

- **Bollinger (20, 2)** breakout: close crosses above the upper band.
- **MACD (12, 26, 9 on close)**: histogram crosses from ≤0 (red) to >0 (green) — i.e. the MACD
  line crosses above its signal line.
- **RSI(2)**: crosses above 90 (extreme overbought, not the oversold-bounce interpretation).

Candles come from GeckoTerminal's free OHLCV endpoint (`api.geckoterminal.com`, no key), which is
per-*pool* not per-mint, so `poolResolver.ts` resolves each watchlist mint to its most-liquid pool
once and caches it in state. `indicators.ts` holds the pure indicator math (SMA/stddev/EMA/Wilder
RSI); `ohlcvClient.ts` fetches and normalizes candles, always dropping the still-open candle
(anti-repainting — signals are only ever evaluated on closed candles, per an explicit product
decision). `stateStore.ts` persists, per mint, the resolved pool and the last processed closed
candle timestamp: this makes evaluation idempotent (a candle is never re-evaluated) and gives a
**silent bootstrap** — a newly-added watchlist entry registers its state on the first cycle
without alerting, so it never fires immediately on a pre-existing condition. Each watchlist entry
is processed in isolation (`Promise.allSettled` in `index.ts`) so one token's API failure never
blocks the others. A volume-spike signal was considered and explicitly dropped from scope.

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
