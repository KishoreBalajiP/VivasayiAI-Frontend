# Vivasayi AI: frontend

React, TypeScript and Vite single-page app for Tamil Nadu farmers, in English and Tamil. It talks only to the Vivasayi AI backend (`VivasayiAI`, a separate repository), plus map tiles and place search in the browser.

**Status (2026-10-17).** `develop` at `56f26eb` with a large **uncommitted** working tree (the claim wizard, tracker, routing and e2e suite described below), pending owner review. There is **no CI and no hosting** for this repository; nothing here is deployed. Open issues are in the backend's [`docs/engineering/KNOWN_ISSUES.md`](../VivasayiAI/docs/engineering/KNOWN_ISSUES.md) (links that start with `../VivasayiAI/` assume the two repositories are checked out side by side).

## Features

| Area | What it does |
|---|---|
| Sign-in | Amazon Cognito Hosted UI (Google federation). The backend verifies the Cognito token once and returns its own session tokens, which the app keeps in `sessionStorage` |
| Chat | Farming assistant chat with saved sessions, voice input (browser speech recognition, English and Tamil) and photo questions |
| Weather | District weather from the backend (`GET /weather`); the header shows the farm's district from the profile, not the device location |
| Farm and parcels | Farm profile, and parcels drawn on a MapLibre map with place search |
| Loss claims | Five-step wizard (parcel, your land, event, evidence, review) with photos (at least one) and recommended land documents, draft saving, and a submission that uploads, then submits, with per-item retry |
| Claim tracker | `#/claims/:id` shows the stages, decision, satellite card and required actions exactly as the backend's progress contract (`GET /claims/:id/progress`) reports them. It polls (minimum 10 s, honours `nextCheckAt`, pauses while hidden, stops on a final state) and has **no "verify" button**: verification runs on the server |
| Appeals and withdrawal | From the tracker |
| Admin review | `#/admin` (admins only): review queue including held claims, override, appeals, read-only verification diagnostics and job re-queue |

Hash routes (`src/routing/hashRoute.ts`): `#/chat` (default), `#/claims`, `#/claims/new`, `#/claims/:id`, `#/admin`. A claim link survives reload and the Cognito login round trip.

Copy is in `src/i18n.ts` and `src/locales/v2.{en,ta}.ts` (key parity is enforced by the type checker). **The Tamil copy has not had a native-speaker review.**

## Requirements

- Node and npm (the 2026-10-16 acceptance run used Node v26.7.0 and npm 11.19.0).
- The backend running locally on port 8000 (`npm run dev` in `VivasayiAI`), or a deployed backend URL.

## Environment

Copy `.env.example` to `.env` and fill it in. Vite inlines every `VITE_*` value into the public bundle at build time, so **never put a secret in one**.

| Variable | Required | Default | Notes |
|---|---|---|---|
| `VITE_API_URL` | yes | `''` (same origin) | Backend base URL, no trailing slash, for example `http://localhost:8000` |
| `VITE_COGNITO_DOMAIN` | yes | `''` | Cognito Hosted UI domain |
| `VITE_COGNITO_CLIENT_ID` | yes | `''` | Must equal the backend's `COGNITO_CLIENT_ID` |
| `VITE_COGNITO_REDIRECT_URI` | yes | `window.location.origin` | Must be registered in the Cognito app client |
| `VITE_MAP_TILE_URL` | no | public OpenStreetMap tiles | Template with `{z}`, `{x}`, `{y}`. An empty value shows "map not configured" |
| `VITE_GEOCODER_URL` | no | public Nominatim search | Place search. An empty value falls back to the public default |

Defaults come from `src/config.ts` and `src/config/map.ts`. The public OpenStreetMap tile server and Nominatim have strict usage policies (the app paces Nominatim to one request per second). They are fine for development; a production deployment needs its own tile and geocoding capacity. See the backend's [`docs/engineering/LIVE_PROVIDER_REQUIREMENTS.md`](../VivasayiAI/docs/engineering/LIVE_PROVIDER_REQUIREMENTS.md).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server (port 5173; the backend's default `CORS_ORIGINS` allows `http://localhost:5173`) |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the build locally |
| `npm run typecheck` | `tsc --noEmit -p tsconfig.app.json` |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit and component tests (jsdom) |
| `npm run contract:check` | Fails if `src/contracts/progress-contract-v1.json` or the example fixture differ from the backend's copy (`VIVASAYI_BACKEND_DIR`, default `../VivasayiAI`). Exit 0 in sync, 1 out of sync, 2 a file missing |
| `npm run e2e:install` | Install Chromium for Playwright |
| `npm run e2e` | Hermetic Playwright suite against the backend harness, desktop and mobile. See [e2e/README.md](e2e/README.md) |
| `npm run e2e:headed` | The same with a visible browser |
| `npm run e2e:typecheck` | Type-check the e2e sources |

## Tests

| Suite | Latest recorded result | Source |
|---|---|---|
| Vitest (`npm test`) | 726 of 726 passed | acceptance run `20261016T205016Z-6dbe6b8` |
| Typecheck, lint, build | passed | same run |
| Playwright (`npm run e2e`) | 90 of 90 passed (45 desktop, 45 mobile), 0 flaky, 0 network violations; re-run on the final tree 2026-10-17: 90 of 90 | same run; backend `test-results/audit/final-e2e.log` |

The run and its report are produced from the backend: `npm run acceptance && npm run acceptance:report` in `VivasayiAI` writes `test-results/acceptance/REPORT-<runId>.md`. These tests use mocked providers; they do not show that live Gemini, Copernicus or Cognito work.

## Project layout

```
src/
  App.tsx, main.tsx          app shell and hash routing
  api.ts, api/               backend client (claims, progress, admin, diagnostics)
  components/                chat, weather, farm and parcel maps, claims, admin review
  components/claims/         tracker (ClaimTracker, ProgressStages, SatelliteCard, ...) and wizard/
  components/ui/             shared primitives (Button, Card, ConfirmDialog, Stepper, StatusPill, ...)
  context/                   AuthContext, LocationContext
  hooks/                     useClaimProgress (polling), useWeatherSource
  contracts/                 progress-contract-v1.json (copy of the backend's)
  routing/                   hashRoute.ts, useHashRoute
  services/                  geocoding, reverse geocoding, Tamil Nadu classifier
  utils/                     claim flow, submission orchestrator, draft storage, polling, geometry
  i18n.ts, locales/          English and Tamil copy
e2e/                         Playwright suite (see e2e/README.md)
scripts/check-contract-sync.mjs
```

## Known limitations

- No CI and no hosting yet.
- Tamil copy needs a native-speaker review.
- Tiruvarur is missing from the district list (`src/config/tamilnaduDistricts.ts`).
- Land documents must be images (JPEG, PNG, WebP); PDFs are refused, and an attached land document cannot be deleted.
- No notifications: farmers see progress only by opening the tracker.
- The admin override dialog has no focus trap.

The full list, with sources, is the backend's `docs/engineering/KNOWN_ISSUES.md`.
