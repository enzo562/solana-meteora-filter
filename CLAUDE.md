# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start the Vite dev server with HMR
- `npm run build` — type-check (`tsc -b`) then produce a production build; the build fails on any TypeScript error
- `npm run lint` — run ESLint over the repo
- `npm run preview` — serve the production build locally
- `npm run alerter` — run the Meteora new-pool alerting service (see below); polls continuously until killed

There is no test runner configured in this project.

## Architecture

A single-page React 19 + TypeScript + Vite app for scouting Solana tokens and Meteora DLMM liquidity pools. Everything runs client-side in the browser — there is no backend; the app calls third-party crypto APIs directly with `fetch`.

`src/App.tsx` sets up `react-router-dom` with five routes (`/filter`, the default, `/gecko`, `/dexscreener`, `/solanatracker`, `/pools`) plus a top nav (`NAV_ITEMS`). Each route is a self-contained page component under `src/pages/` that owns its own data-fetching, polling, loading/error state, and rendering. There is no shared state or store between pages — the only shared code is `src/lib/apiError.ts` — treat each page as an independent unit otherwise.

- **`src/pages/FilterPage.tsx`** — queries the Birdeye API (`public-api.birdeye.so`) for Solana tokens filtered by hard-coded thresholds (`MIN_VOLUME_5M`, `MAX_MARKET_CAP`), auto-refreshing every 30s. Requires the Birdeye API key (see below). Note: its default export is named `App`, but it is the Filter page, not the root component.
- **`src/pages/GeckoTerminalPage.tsx`** — queries the GeckoTerminal API (`api.geckoterminal.com`) for Solana pools sorted by 24h volume server-side, then filters/sorts by 5m volume client-side (the API has no native 5m sort). No API key required. Polls every 30s.
- **`src/pages/DexScreenerPage.tsx`** — queries the DexScreener search endpoint (`api.dexscreener.com`) with several hard-coded queries (`SEARCH_QUERIES`), since DexScreener has no "global list" endpoint; results are deduplicated, filtered, and sorted by 5m volume client-side. No API key required. Polls every 30s.
- **`src/pages/SolanaTrackerPage.tsx`** — queries the Solana Tracker Data API (`data.solanatracker.io/tokens/trending/5m`). Requires `VITE_SOLANATRACKER_API_KEY`; renders a setup-instructions screen instead of fetching when the key is missing. Polls every 30s.
- **`src/pages/PoolsPage.tsx`** — polls the Meteora DLMM data API (`dlmm.datapi.meteora.ag/pools`) for the newest pools every 15s, sorted by creation time.
- **`src/lib/apiError.ts`** — shared helper used by every token-listing page to turn a failed `fetch` `Response` into a readable `ApiFailure` (`readApiFailure`) and display string (`formatApiFailure`), distinguishing quota/auth/rate-limit/server-error causes from the HTTP status and response body.

Common conventions across pages: filter/threshold constants are `const`s at module top, `formatAge()` converts Unix-second timestamps to human strings, polling is a `setInterval` inside a `useEffect` cleaned up on unmount, and UI is inline-styled monospace tables (no CSS framework). UI text is in French.

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
