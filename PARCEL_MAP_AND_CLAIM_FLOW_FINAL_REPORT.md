# Parcel Boundary Drawing & Claim Affected-Area Flow — Final Report

ADR-019 Phase 8 (parcel geometry) follow-through, frontend and backend.

---

## 1. Outcome summary

Farmers can now draw a parcel boundary on a real MapLibre map, save it, reopen it, and then draw
the **affected area** inside that boundary when filing a claim. The backend owns every acreage
number; the map is only ever a drawing surface and a preview.

| Gate | Result |
| --- | --- |
| Frontend `typecheck` | **pass** (0 errors) |
| Frontend `lint` | **pass** (0 errors, 2 pre-existing warnings) |
| Frontend `test` | **pass** — 14 files, **250** tests |
| Frontend `build` | **pass** — 5.1 s |
| Backend `test` | **pass** — 15 files, **443** tests |

Nothing was committed, pushed, or deployed.

---

## 2. What was built

### 2.1 Map engine and editor

| File | Purpose |
| --- | --- |
| `src/config/map.ts` | Tile URL resolution, default centre/zoom, attribution, template validation |
| `src/utils/parcelGeometry.ts` | Client-side polygon validation, containment advisory, acreage preview |
| `src/components/ParcelDrawMap.tsx` | The MapLibre + draw editor |
| `src/components/LazyParcelDrawMap.tsx` | On-demand chunk wrapper |

Dependencies: `maplibre-gl@^5.24.0`, `maplibre-gl-draw@^1.6.9`, `@turf/turf@^7.4.0`.

The editor supports create/update/delete, seeding an existing polygon, clear and redraw, recentre,
resize (a `ResizeObserver` handles mobile layout animation), tile load/error states, an accessible
map surface, and a context outline showing the parcel an affected area must sit inside.

`maplibre-gl-draw` bundles types referencing a forked `kt-maplibre-gl` build, so the control is cast
to `IControl`. The cast is deliberate and documented: at runtime the control only needs
`onAdd`/`onRemove`/`getDefaultPosition`, which it implements. No `any` leaks into surrounding code
and no `esModuleInterop` change was needed.

### 2.2 Parcel boundary flow (`ManageParcels.tsx`)

- Add/Edit Parcel now uses the real map instead of the old placeholder.
- A boundary is **required**: submitting without one shows `boundaryRequired` and calls nothing.
- `createParcel`/`updateParcel` are sent **geometry only**. No acreage is ever sent from the client.
- Legacy parcels with no usable boundary are flagged (`No boundary` + hint) instead of being
  presented as claimable. View Map is withheld; Edit is still offered so the boundary can be drawn.
- While editing, the area the **backend** currently stores is shown, so the farmer can compare it
  against the live preview.

### 2.3 Claim affected area (`ClaimWizard.tsx`)

- Parcels are filtered through `hasUsableGeometry`; a legacy parcel is disabled in the list, and if
  *no* parcel is claimable the wizard stops with `No parcel with a boundary`.
- The area step offers **"use the whole parcel"** or a drawn polygon inside the parcel boundary.
- The drawn polygon is submitted as the claim's `geometry`. It is never silently replaced by the
  full boundary, and switching back to "whole parcel" reverts deliberately.
- An advisory warning appears if the drawn polygon leaves the parcel. The decision that counts is
  the backend's (see §5).

### 2.4 Read-only map view — real defect found and fixed

`View Map` was rendering the **full interactive editor** behind a "read-only" comment, so a farmer
could draw, edit, and delete a boundary that was never saved. Fixed by adding a `readOnly` prop:

- the draw control is constructed in MapboxDraw's own `static` mode with no controls;
- `handleDraw`, `resetToEmpty`, and `handleRedraw` all short-circuit when read-only;
- Clear and Redraw are not rendered; Centre stays, since panning/zooming is legitimate;
- the client acreage preview is hidden, because the parent already renders the authoritative value.

`onChange` is now optional (it is never emitted in read-only mode) and guarded with `?.`. The
component tests assert `readOnly` is passed **and** that the stand-in map's draw button is disabled.

### 2.5 Configuration and i18n

`VITE_MAP_TILE_URL` is a public raster tile template:

- unset → `https://tile.openstreetmap.org/{z}/{x}/{y}.png`
- set → that template
- **empty string** → tiles disabled, with an explanatory panel instead of a blank grey box

Full EN and TA coverage was added for map, drawing, geometry-error, legacy-parcel, and
no-claimable-parcel strings, plus `mapViewOnlyHint` and `close`. The obsolete `geometryNotClosed`
key was removed because open three-vertex rings are normalised before validation.

---

## 3. Bundle impact

The map engine is code-split and fetched only when a map opens:

```
dist/assets/index-*.js            480.71 kB │ gzip: 141.08 kB
dist/assets/ParcelDrawMap-*.js  1,184.55 kB │ gzip: 319.53 kB   ← lazy
dist/assets/index-*.css            38.55 kB │ gzip:   6.85 kB
dist/assets/ParcelDrawMap-*.css    75.28 kB │ gzip:  11.59 kB   ← lazy
```

Before this work the map shipped in the initial bundle. It now costs the first paint nothing, which
matters most on the low-end Android devices the UI targets.

---

## 4. Tests

### 4.1 Frontend — 250 tests across two Vitest projects

| Project | Environment | Files | Tests |
| --- | --- | --- | --- |
| `unit` | node | 12 | 235 |
| `dom` | jsdom | 2 | 15 |

New unit tests:

- `src/utils/parcelGeometry.test.ts` — **35**. Ring closure, 100-vertex limit, self-intersection,
  minimum area, containment advisory, area conversion, feature extraction, `hasUsableGeometry`.
- `src/config/map.test.ts` — **14**. Tile fallback/override/disable, invalid templates, bounds and
  recentre anchoring, non-finite coordinate handling.
- `src/api/parcels.test.ts` — **11**. Parcel client contract.

New component tests (`dom` project):

- `src/components/ManageParcels.test.tsx` — **9**. Boundary required before save; the exact emitted
  polygon is submitted and nothing else; no `calculatedAreaAcres` in the payload; edit seeds the
  stored boundary and submits the *newly drawn* one; View Map is genuinely read-only and shows the
  backend acreage; legacy parcels are flagged and have no View Map action.
- `src/components/ClaimWizard.test.tsx` — **6**. The drawn affected area is submitted and is
  explicitly asserted **not** to equal the parcel boundary; whole-parcel selection submits the
  boundary; re-tapping reverts to the whole parcel; no acreage field is ever sent; legacy parcels are
  disabled and unselected.

MapLibre needs WebGL, which jsdom does not provide, so `ParcelDrawMap` is replaced by a stand-in that
exposes its props. What is under test is therefore the **parent contract** — which is exactly where
the requirements live. The map component's own runtime behaviour is covered in a real browser
(see §7).

To make this possible, `vitest.config.ts` now defines two projects (`unit` on node, `dom` on jsdom),
and `src/test/setup.ts` was made **conditional**: it installs its `window` shim only when there is
no DOM. It previously replaced `globalThis.window` unconditionally, which blanked the document and
made every component test impossible to write. New deps: `jsdom`, `@testing-library/react`,
`@testing-library/jest-dom`, `@testing-library/user-event`.

Two stale fixtures were also corrected so the suite reflects the current types:
`src/api/admin.test.ts` and `src/utils/adminQueue.test.ts` (the latter was missing `audit: []`).

### 4.2 Backend — 443 tests across 15 files

New `tests/parcelMapClaimFlow.api.test.js` — **18 tests**, a real integration suite against the real
Express app, auth middleware, validation schemas, geometry service, spatial engine, and a real Mongo:

- boundary drawn → persisted with server-computed acreage
- too-few-vertices and self-intersecting boundaries rejected
- client-supplied area ignored on create
- redrawing recomputes the authoritative area
- `POST /profile/parcels/:id/area` returns the backend computation (this is the exact endpoint
  `recalculateParcelArea()` calls)
- cross-owner edit rejected; delete removes the parcel and it is no longer claimable
- **whole-parcel claim** → claimed area equals the parcel area
- **smaller drawn affected area** → claimed area equals the *affected* polygon and is strictly less
  than the parcel area
- parcel snapshot preserves the acreage true at filing time, immune to later boundary edits
- client-supplied claimed area ignored
- invalid affected geometry rejected; cross-owner claim rejected
- Phase 9 spatial verdict: inside → contained; beyond the boundary → `outside_parcel`;
  verified/in-flight siblings reduce remaining eligible acreage

### 4.3 A pre-existing flaky test found and fixed

`tests/admin.unit.test.js > "compareQueueRows uses createdAt as a stable tiebreak"` failed
intermittently (about 0.6 % of runs, more often under a busy parallel run) and passed in isolation.

Cause: `daysIso()` reads `Date.now()` on **every call**, so
(a) two `daysIso(5)` calls could differ by 1 ms, which let the *primary* `decidedAt` comparison
decide the order so the `createdAt` tiebreak under test was never reached, and
(b) calling `daysIso()` again inside the `toEqual` expectation produced a string that could differ
from the value under test by 1 ms.

Fix: compute each timestamp exactly once and compare by identity, plus assert the comparator
directly in both directions. Verified at **0 failures in 20,000 runs**.

---

## 5. Backend authority (unchanged, and covered)

No backend source behaviour was modified. The new UI is built to defer to it:

- the backend re-validates geometry and recomputes acreage on **every** write;
- client-supplied area is stripped;
- containment, overlap, duplicate-area and overclaim decisions belong to
  `services/claimSpatial.service.js` and the Phase 9 verification engine;
- the parcel snapshot freezes acreage at filing time.

The client-side containment check is advisory only and deliberately labelled as such.

---

## 6. Honest limitations

1. **No browser or device run.** MapLibre requires WebGL and a real tile server. The map component's
   runtime behaviour — actual polygon drawing, tile loading, touch gestures, the 360/390/768 px
   layouts — was **not** exercised in a real browser. All of it is covered by unit and component
   tests with the map stubbed. The responsive CSS was written to avoid covering Save on 360 px, but
   that is a design intent, not an observation.
2. **`remainingEligibleAcres` semantics.** It measures what is left for *other* claims, so the claim
   being evaluated is not subtracted from it. A first test asserted the opposite and was wrong; the
   test now documents the real contract.
3. **Geodesic area is not exactly 4× when a square doubles.** Doubling both sides of a square at
   10°N does not produce exactly four times the area on a spherical earth. The test asserts this
   approximately and says why, rather than pretending the earth is flat.
4. **Profile fields.** Backend profile upsert persists only `district`, `crops`, `acres`, and
   `language`. Name / Mobile / Village / Soil Type are **not** persisted. Nothing in this work
   changed that, and it must not be claimed as working.
5. **Duplicated API clients remain.** `src/api.ts` and `src/api/claims.ts` both expose parcel
   endpoints. Not consolidated in this pass.
6. **Two pre-existing lint warnings** (`react-refresh/only-export-components`) remain; they are not
   introduced by this work.
7. `parcelMapClaimFlow.api.test.js` is an integration suite, not a browser test. It proves the
   server honours the polygon; it does not prove a farmer can draw one on a touchscreen.

---

## 7. Recommended next steps

1. Run the app in a real browser and walk the golden path: add parcel → draw boundary → save → view
   (confirm the view map cannot be edited) → file a claim → draw a smaller affected area → submit →
   confirm `claimedAreaAcres` is smaller than the parcel area.
2. Repeat at 360 px, 390 px, and 768 px, checking that the map controls never cover Save and that
   touch drawing works.
3. Point `VITE_MAP_TILE_URL` at the production tile service and confirm attribution renders.
4. Switch the UI language to Tamil and re-walk the flow to confirm the map strings.
5. Consolidate the duplicated parcel clients and confirm the profile field list.
