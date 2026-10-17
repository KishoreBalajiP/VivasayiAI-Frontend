# End-to-end tests (Playwright, hermetic)

The suite drives the real frontend against the real backend API and verification worker, with every external provider replaced by a stand-in. No AWS, Gemini, Copernicus, Open-Meteo, Cohere, Chroma, Nominatim or OpenStreetMap traffic leaves the machine. Design: backend ADR-024 (`VivasayiAI/docs/decisions/18_DECISIONS.md`).

**What a pass means.** The flows work end to end with **mocked providers** (a fake Gemini, mock storage, mock land records, mock weather and a simulated satellite provider). It says nothing about the live providers or about real claims.

## Requirements

- The backend checkout next to this repository (`../VivasayiAI`), or set `VIVASAYI_BACKEND_DIR`. Its dependencies must be installed (`npm ci --legacy-peer-deps` there).
- Node and this repository's dependencies (`npm ci`).
- Chromium for Playwright: `npm run e2e:install` (`playwright install chromium`). `@playwright/test` is pinned to 1.63.0.
- A MongoDB binary for mongodb-memory-server. The backend harness uses a system `mongod` when it finds one (`MONGOMS_SYSTEM_BINARY`, or `/opt/homebrew/bin/mongod`, `/usr/local/bin/mongod`); otherwise mongodb-memory-server downloads one on the first run.

No `.env` file is read by the run: the harness loads the committed `scripts/e2e/e2e.env` in the backend, and Vite gets its environment from `e2e/lib/env.ts` (mirrored for reference in `.env.e2e`).

## Running

```bash
npm run e2e            # the whole suite, desktop-chromium and mobile-chromium
npm run e2e:headed     # the same with a visible browser
npm run e2e:typecheck  # type-check the e2e sources
npx playwright test e2e/claim-submit-auto.spec.ts --project=desktop-chromium   # one spec, one project
```

`playwright.config.ts` starts three servers fresh for every run (`reuseExistingServer: false`, so a dev server wired to a real `.env` is never picked up):

| Server | Address | What it is |
|---|---|---|
| `harness` | API `127.0.0.1:18080`, control `127.0.0.1:18081` | `node ../VivasayiAI/scripts/e2e/hermeticBackend.js --worker=inline`: the real API and worker on a throw-away MongoDB, with a fake Gemini and a loopback-only network guard |
| `harness-process` | API `127.0.0.1:18082`, control `127.0.0.1:18083` | The same with `--worker=process` (the worker is a separate process the test can kill); used by E2E-11 only |
| `vite` | `127.0.0.1:15173` | `vite --mode e2e`, pointed at the first harness; map tiles and the geocoder are served by its control server |

`workers: 1` is required, because the fake-Gemini scenario is process-wide in the harness. A full run took 21.9 minutes in the 2026-10-16 acceptance run.

## How the tests stay hermetic

- **Sessions.** `e2e/fixtures.ts` asks the harness control server to mint a session and injects it into the page's `sessionStorage`, exactly what the app stores after a real Cognito login. There is no Cognito bypass and no `__e2e` code in `src/` (audit B checked the built `dist/`). A real Cognito login is therefore not covered by this suite.
- **Network.** The fixtures abort every non-loopback browser request. After each test the run fails unless both the browser's blocked list and the backend guard's list (`GET /__e2e/network-violations`) are empty. Both lists are attached to the test for the acceptance report.
- **Isolation.** Each test gets a fresh farmer (user, profile and one parcel near Thanjavur). Before each test the harness scenario is reset to the defaults in `../VivasayiAI/scripts/e2e/scenarios.json` and a paused worker is resumed.
- **Control token.** `playwright.config.ts` generates `E2E_CONTROL_TOKEN` per run (unless one of at least 16 characters is set) and passes it to both harnesses. The control server is never mounted on the product API.

## Layout

| Path | Contents |
|---|---|
| `fixtures.ts` | `harness`, `language`, `farmer`, `farmerPage`, `signIn`, `newContext` and `network` fixtures |
| `lib/env.ts` | Ports, URLs, the Vite environment, report paths |
| `lib/harness.ts` | Client for the harness control server |
| `lib/trackerRecorder.ts` | Records what the tracker showed against the API responses |
| `pages/` | Page objects: `ClaimWizardPage`, `ClaimTrackerPage`, `AdminReviewPage` |
| `global-teardown.ts` | Writes the backend guard's network-violation list for the acceptance report |
| `*.spec.ts` | The tests (below) |

## Specs

| Spec | Test IDs | Covers |
|---|---|---|
| `claim-submit-auto.spec.ts` | E2E-01, E2E-02, E2E-05 | Wizard to tracker to decision with zero `POST /verify` requests; no verify button in any state; ten photos and two land documents fit the default rate limits |
| `idempotent-submit.spec.ts` | E2E-03 | A double-click and a connection reset on submit still give one claim, one submitted audit and one plan |
| `ai-failures.spec.ts` | E2E-06, E2E-07, E2E-08a, E2E-08b | Gemini 429 then recovery; 503, timeout and malformed output end in a technical hold, never an adverse decision or "more evidence" |
| `land-docs.spec.ts` | E2E-09, E2E-10 | A PDF is refused by the browser and the server; a tenant without land documents still gets a decision |
| `worker-crash.spec.ts` | E2E-11 | The separate worker process is killed mid-step and the claim still completes |
| `area-overlap.spec.ts` | E2E-12, E2E-13 | Over-limit area; overlap with another farmer's claim |
| `satellite-weather.spec.ts` | E2E-14 to E2E-17 | Satellite waiting for post-event imagery, passed (info tone), cloud, no clear change; weather unavailable. The decision never depends on them |
| `authz.spec.ts` | E2E-18 | Another farmer's claim link shows "not found" and every read is a 404 |
| `review-appeal.spec.ts` | E2E-19a, E2E-19b | A held claim decided by an admin override; an appeal |
| `i18n.spec.ts` | E2E-20 | English and Tamil statuses |
| `responsive.spec.ts` | E2E-21 | Tracker, list and wizard fit the screen; header controls are named; focus is visible |
| `refresh-reopen.spec.ts` | E2E-22 | Reload and a reopened `#/claims/:id` link while the worker is paused resume polling |
| `api-failure.spec.ts` | E2E-23 | Repeated 503s on `/progress`, then recovery |
| `no-fake-progress.spec.ts` | E2E-24 | The page never shows a status the API has not reported, and nothing moves while the worker is paused |
| `decision-consistency.spec.ts` | E2E-25 | For each scenario in `scenarios.json`, the decision shown matches the deterministic policy |

Each spec runs in both projects (`desktop-chromium` at 1440×900, `mobile-chromium` as a Pixel 7): 45 tests per project, 90 in all.

## Results

- Reports: `test-results/e2e/results.json` (or `E2E_JSON_OUT`), an HTML report in `test-results/e2e/html/`, and screenshots, traces and videos per test in `test-results/e2e/artifacts/`. Screenshots are taken for every test.
- The backend's `npm run acceptance` runs this suite with the backend and frontend unit tests and writes one combined report (`../VivasayiAI/test-results/acceptance/REPORT-<runId>.md`).
- Latest recorded result: **90 of 90 passed** (45 per project, 0 flaky, 0 network violations) in acceptance run `20261016T205016Z-6dbe6b8` (`../VivasayiAI/test-results/acceptance/REPORT-20261016T205016Z-6dbe6b8.md`). Re-run on the final working trees on 2026-10-17: 90 of 90 passed in 21.4 min (`../VivasayiAI/test-results/audit/final-e2e.log`).

## Troubleshooting

- **"Possible version conflict" from MongoMemoryServer** with a system `mongod` (for example 8.2.5 against the requested 8.2.6) is a warning; the run uses the system binary.
- **A port is in use** (15173, 18080 to 18083): stop the other process; the servers are never reused.
- **A network violation fails a test:** the attached `network-violations` JSON names the host. Something in the app or the backend reached outside loopback; fix that rather than allow-listing it.
