# Northstone

Business management app for Northstone landscaping: leads/CRM, site surveys,
job pricing & estimates, proposals, construction tracking, team calendar, and
a client portal.

## Stack

- **React + Vite** (JavaScript)
- **Supabase** — database & auth (not yet wired up, see below)
- **Cloudflare Pages** — hosting

## Project structure

```
src/
  main.jsx              Vite entry point
  App.jsx                Top-level app, loads storage polyfill + renders NorthstoneSystem
  NorthstoneSystem.jsx    The full app (prototype, ported as-is for now)
  lib/
    supabaseClient.js     Supabase client, reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
    storagePolyfill.js     Temporary localStorage-backed shim for window.storage
public/
  _redirects              SPA fallback routing for Cloudflare Pages
```

`NorthstoneSystem.jsx` currently holds the whole app (all screens, all state)
as it was ported from the original single-file prototype. It reads/writes
data through `window.storage`, an API that only exists in the claude.ai
sandbox the prototype was built in. `lib/storagePolyfill.js` polyfills that
API on top of `localStorage` so the app runs standalone. This is scaffolding,
not the real data layer — the next phase of work is migrating each feature
(projects, leads, quotes, team, etc.) off `window.storage`/local state and
onto Supabase tables with proper auth, and splitting this file into smaller
components as that happens.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project URL + anon key
npm run dev
```

## Build

```bash
npm run build      # outputs to dist/
npm run preview    # preview the production build locally
```

## Deploying to Cloudflare Pages

- Build command: `npm run build`
- Build output directory: `dist`
- Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (set in the Pages project's dashboard, not committed)
