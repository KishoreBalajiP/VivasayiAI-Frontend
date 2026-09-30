# Location Search on the Parcel / Claim Maps — Final Report

**Scope:** add forward-geocoding location search to the existing MapLibre parcel-boundary and
claim affected-area maps, without changing the drawing flow, the parcel/claim architecture, or any
backend behaviour.

**Repository state:** not a git repository; nothing was committed, pushed, or deployed.

---

## 1. What was built

A search box rendered **above** the shared map in `ParcelDrawMap`, letting a farmer type a village,
town, district, landmark or named locality and jump the map there before drawing their boundary.

| File | Role |
| --- | --- |
| `src/services/locationSearch.ts` | Forward geocoding against Nominatim, with result validation, abort support, and explicit failure reporting |
| `src/services/geocoderRateLimit.ts` | Shared ~1 request/second limiter for the public Nominatim instance, used by **both** search and reverse geocoding |
| `src/components/ParcelLocationSearch.tsx` | Search UI: debounce, loading / results / empty / error states, keyboard support, ODbL attribution |
| `src/config/map.ts` | Geocoder endpoint resolution, query/pacing constants, bounding-box → zoom |
| `src/components/ParcelDrawMap.tsx` | Renders the search box; maps a selection to `flyTo`; adds a "My location" control |
| `src/services/reverseGeocode.ts` | Paced through the shared limiter (one-line change; logic untouched) |
| `src/context/LocationContext.tsx` | Added `useOptionalLocation()` so the map works with or without a provider |
| `src/i18n.ts` | English + Tamil strings for every new state |
| `.env.example` | `VITE_GEOCODER_URL` documentation, including the Nominatim usage policy |
| `src/vite-env.d.ts` | Optional `VITE_GEOCODER_URL` typing |

No existing map control was removed or replaced. `MapboxDraw` still owns all geometry.

---

## 2. The core safety property

**A search result moves the camera. It can never create, modify, validate or imply parcel geometry.**

This is enforced by construction and by test, not merely by convention:

* `LocationSearchResult` has **no geometry field at all** — only `label`, `secondary`, `lat`, `lon`,
  `zoom`, `kind`. There is nothing downstream that could mistake a place for a boundary.
* The parent handler calls `map.flyTo({ center: [lon, lat], zoom })` and nothing else. It never
  touches the draw control, `value`, or `onChange`.
* A farmer must still draw their boundary explicitly and save it. Backend acreage, containment,
  ownership and overlap checks are unchanged and remain authoritative.

Verified in `src/components/ParcelDrawMap.test.tsx` by asserting that after a search selection
`draw.add`, `draw.deleteAll`, `draw.changeMode`, `setFeatureProperty` and `onChange` were **not**
called, and that an existing saved polygon was neither disturbed nor re-seeded.

---

## 3. Nominatim integration and public-usage policy

Default endpoint: `https://nominatim.openstreetmap.org/search` (no key, no secret). Override with
the public, non-secret `VITE_GEOCODER_URL` for a self-hosted or proxied Nominatim-compatible
endpoint.

The public instance is a **shared, donation-funded resource** with a hard policy (~1 request/second,
no heavy use, working `Referer`, ODbL results). This is acceptable for development and low volume
but is **not guaranteed production capacity**.

Measures implemented:

| Measure | Where |
| --- | --- |
| Keystrokes debounced 400 ms (one request per pause in typing) | `ParcelLocationSearch.tsx` |
| Queries shorter than 3 characters never reach the network | `locationSearch.ts` |
| Superseded requests aborted; monotonic request id discards stale responses | `ParcelLocationSearch.tsx` |
| **Hard ≤1 request/second cap, shared by search *and* reverse geocoding** | `geocoderRateLimit.ts` |
| Self-hosted endpoints are not throttled (operator's own capacity) | `geocoderRateLimit.ts` |
| ODbL credit shown with results ("Search © OpenStreetMap contributors") | `ParcelLocationSearch.tsx` |

The rate cap is enforced in the service rather than the component on purpose: debouncing alone does
**not** satisfy the policy, because a farmer who pauses between words produces requests hundreds of
milliseconds apart.

The limiter is deliberately **shared** rather than private to search. Forward search and reverse
geocoding hit the same host, so per-service counters would each look compliant in isolation while a
search followed by a "My location" tap still breached the cap. Both now pass through one limiter
keyed on the public host, so any path (`/search` or `/reverse`) counts against the same budget.

---

## 4. Honest state reporting

"No such place" and "the request failed" are different answers and are never conflated.
`searchLocations` returns a discriminated union:

```ts
type LocationSearchOutcome =
  | { status: 'ok'; results: LocationSearchResult[] }          // may legitimately be empty
  | { status: 'failed'; reason: 'aborted' | 'offline' | 'timeout' | 'server' | 'malformed' };
```

* `{ status: 'ok', results: [] }` → "No locations found".
* `failed` with `offline` / `timeout` / `server` / `malformed` → a localized failure message.
* `failed` with `aborted` → **nothing is rendered**, because an abort only means a newer query
  superseded this one; showing an error would be a lie.

Geocoder data is treated as untrusted input. Results are dropped unless they carry finite,
in-range coordinates and a non-empty name. A malformed response yields a failure, never an invented
position. `map` state is never fabricated: if there is no map instance, nothing moves and no
"showing…" confirmation is emitted.

---

## 5. Current location

Reuses the existing infrastructure — `getBrowserPosition()` in `src/services/locationService.ts`
and `LocationContext` — rather than adding a second geolocation implementation.

* **Centre** is unchanged and keeps its distinct role: re-centre on the parcel being drawn.
* **"My location"** is a separate control that re-centres on the farmer's own position.
* A cached fix is reused, so a known position never triggers a second permission prompt.
* Denied permission produces a localized, plain-language notice and leaves the map and search fully
  usable. Search is the documented fallback.
* With no `LocationProvider` mounted the map degrades to search-only instead of throwing, and no
  dead "My location" button is rendered.

---

## 6. Two real bugs found and fixed during testing

These were caught by the new tests, not by inspection.

**a) The rate limiter let requests bunch up.** A plain "wait until `lastRequestStartedAt + interval`"
check is not sufficient: two requests arriving while a slot was still queued both read the same
stale timestamp, both concluded they were clear to go, and both fired at once — precisely the burst
the shared instance's rate cap exists to prevent. Fixed by serialising slot claims through a promise
chain, so each request claims its turn only after the previous one has claimed its own. A request
aborted while queued does not stamp the clock, because no request was sent.
Covered by *"does not let queued requests bunch up when they all arrive together"* and *"serialises
queued participants so they cannot bunch up"*.

**b) A region-wide match zoomed all the way in.** `zoomForBoundingBox` floored its result at
`DEFAULT_PLACE_ZOOM` (14). Searching "India" therefore flew the camera to zoom 14 over a
subcontinent. The floor was intended only for point-like results, which are handled separately, and
`DEFAULT_PLACE_ZOOM` is now used solely as the fallback when there is no bounding box at all.
Covered by *"zooms OUT for a region-wide match instead of clamping to the default place zoom"*.

**c) Search and reverse geocoding could jointly breach the rate cap.** The new "My location"
control triggers reverse geocoding, so a farmer who searched and then tapped it would have made two
public-instance requests in quick succession, even though each service honoured its own limit.
Fixed by extracting one shared limiter (`geocoderRateLimit.ts`) used by both. Covered by *"spaces
requests from DIFFERENT endpoints on the same public host"* and *"is paced by the same limiter as
forward search"*.

Smaller fixes made along the way: a JSON parse failure was reported as a network fault rather than a
malformed response; the search status message was rendered twice (visibly *and* in a live region),
double-announcing to screen readers; and the "My location" button was rendered even with no provider.

Dead code was also removed rather than shipped untested: a pending-flyTo queue existed for "search
selected before the map loaded", but the missing-tiles branch returns before the search box renders,
so a map instance always exists by the time a result can be picked.

---

## 7. Verification

All gates run in this environment:

| Gate | Result |
| --- | --- |
| `npm run typecheck` | **Pass** — 0 errors |
| `npm run lint` | **Pass** — 0 errors, 2 pre-existing warnings (`ClaimStatusCard.tsx`, `AuthContext.tsx`) |
| `npx vitest run` (frontend) | **Pass** — 18 files, **352 tests** (up from 14 files / 250) |
| `npm run build` | **Pass** — built in 5.00s (pre-existing chunk-size notice only) |
| `npx vitest run` (backend) | **Pass** — 15 files, **443 tests**, unchanged |

New tests (102 total):

* `src/services/geocoderRateLimit.test.ts` — 14 tests: public-host detection (including the
  `/reverse` path), cross-endpoint spacing, queue serialisation, abort-while-queued, chain recovery
  after a rejection, and reverse geocoding going through the shared limiter.
* `src/services/locationSearch.test.ts` — 44 tests: query guards, endpoint resolution, result
  validation against hostile input, no-results vs. failure distinction, timeout/abort handling, and
  request pacing (including the bunch-up regression).
* `src/components/ParcelLocationSearch.test.tsx` — 25 tests: debounce, stale/superseded responses,
  empty vs. error states, keyboard selection, clear, outside-click, unmount abort, a11y, and 360px
  overflow safety.
* `src/components/ParcelDrawMap.test.tsx` — 11 tests: `flyTo` with `[lon, lat]` ordering, no geometry
  mutation, boundary preservation, Centre/Redraw/Clear still working, read-only mode, device-location
  controls.
* `src/config/map.test.ts` — 8 added tests for geocoder endpoint resolution, pacing constants and
  bounding-box zoom.

---

## 8. Verification NOT performed

* **No real browser / WebGL verification.** MapLibre rendering, actual tile loading, touch gestures
  (pinch, drag), the real MapboxDraw control, and real Nominatim network responses were **not**
  exercised. MapLibre and MapboxDraw are mocked in tests.
* **Responsive layout at 360 / 390 / 768px** is verified only by asserting the CSS constraints
  (`w-full`, `min-w-0`, `truncate`, absolutely-positioned dropdown) — not by visual measurement.
* **Live geocoding was never called.** All provider interaction is mocked, so real-world result
  quality, Nominatim throttling behaviour and rate-limit responses under genuine load are unproven.
* Screen-reader behaviour was checked via ARIA roles/labels, not with an actual assistive technology.

---

## 9. Known limitations and recommendations

* **Self-host Nominatim for production.** The app stays within the public instance's rate cap, but a
  shared donation-funded service is not a production dependency. Set `VITE_GEOCODER_URL`.
* Searches are intentionally **not** restricted to settlements, so landmarks and named localities
  remain findable. A `featuretype` filter was considered and rejected for that reason.
* Only the first ~6 results are shown; there is no "load more" or map-preview affordance.
* The reverse geocoder in `src/services/reverseGeocode.ts` is **not** configurable via
  `VITE_GEOCODER_URL` — it still uses the public Nominatim reverse endpoint directly, so a
  self-hosted deployment still sends reverse-geocoding requests to the public instance (paced, but
  not redirected). Pointing reverse geocoding at the self-hosted instance is the recommended
  follow-up.
* The search box is also shown on the read-only "View Map" surface. It is a view-only aid there
  (no geometry can be drawn), but hiding it would need a separate prop.
