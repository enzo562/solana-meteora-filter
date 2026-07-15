# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start the Vite dev server with HMR
- `npm run build` — type-check (`tsc -b`) then produce a production build; the build fails on any TypeScript error
- `npm run lint` — run ESLint over the repo
- `npm run preview` — serve the production build locally

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

## Configuration

- `VITE_BIRDEYE_API_KEY` (required for `/filter`) — read via `import.meta.env.VITE_BIRDEYE_API_KEY`.
- `VITE_SOLANATRACKER_API_KEY` (required for `/solanatracker`) — the page degrades gracefully (setup instructions, no fetch) when absent.

Both are defined in `.env` at the repo root. Because they are `VITE_`-prefixed variables, they are embedded into the client bundle at build time and are not secret in production. New client-visible config must use the `VITE_` prefix to be exposed by Vite. GeckoTerminal, DexScreener, and Meteora require no API key.
