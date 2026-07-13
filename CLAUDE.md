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

`src/App.tsx` sets up `react-router-dom` with two routes (`/filter`, the default, and `/pools`) plus a top nav. Each route is a self-contained page component under `src/pages/` that owns its own data-fetching, polling, loading/error state, and rendering. There is no shared state, store, or data layer between pages — treat each page as an independent unit.

- **`src/pages/FilterPage.tsx`** — queries the Birdeye API (`public-api.birdeye.so`) for Solana tokens filtered by hard-coded thresholds (`MIN_VOLUME_5M`, `MAX_MARKET_CAP`), auto-refreshing every 30s. Requires the Birdeye API key (see below). Note: its default export is named `App`, but it is the Filter page, not the root component.
- **`src/pages/PoolsPage.tsx`** — polls the Meteora DLMM data API (`dlmm.datapi.meteora.ag/pools`) for the newest pools every 15s, sorted by creation time.

Common conventions across pages: filter/threshold constants are `const`s at module top, `formatAge()` converts Unix-second timestamps to human strings, polling is a `setInterval` inside a `useEffect` cleaned up on unmount, and UI is inline-styled monospace tables (no CSS framework). UI text is in French.

## Configuration

The Birdeye API key is read from `import.meta.env.VITE_BIRDEYE_API_KEY`, defined in `.env` at the repo root. Because it is a `VITE_`-prefixed variable, it is embedded into the client bundle at build time and is not secret in production. New client-visible config must use the `VITE_` prefix to be exposed by Vite.
