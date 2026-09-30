# CLAIM WIZARD BUTTON WIRING FIX REPORT

## 1. Root Cause

The **Manage Farm** and **Add First Parcel** buttons rendered in the Claim Wizard's
`ParcelStep` empty state were visually correct but functionally inert.

`ParcelStep` already declared and rendered two click handlers:

- `src/components/ClaimWizard.tsx:336` — `onClick={onManageFarm}`
- `src/components/ClaimWizard.tsx:343` — `onClick={onAddFirstParcel}`

Both props are **optional** (`onManageFarm?`, `onAddFirstParcel?`) on
`ClaimWizardProps` (`src/components/ClaimWizard.tsx:35-36`).

The parent, `ClaimsPage`, rendered `<ClaimWizard />` **without passing either prop**:

```tsx
// src/components/ClaimsPage.tsx (before)
<ClaimWizard
  parcels={parcels}
  parcelsStatus={parcelsStatus}
  onRetryParcels={...}
  onCreateClaim={...}
  onUploadEvidence={...}
  onDone={...}
  onCancel={...}
/>
```

Because the props were `undefined`, `onClick={undefined}` attached no handler. React
rendered the buttons, they received hover/focus styling, and clicking them did nothing.
This is why the dead-end was invisible in code review — there was no missing function,
only a missing prop at the call site.

A second, independent gap: even once the buttons navigate to `ManageParcels`, there was
no way to land **directly on the Add Parcel form**, and no way to return to the wizard
after a parcel was created.

---

## 2. Files Changed

| File | Change | Nature |
|------|--------|--------|
| `src/components/ClaimsPage.tsx` | Pass `onManageFarm` / `onAddFirstParcel`; extended `manageParcels` subview with `autoOpenAdd` + `returnToWizard`; added `handleManageParcelsCreated` | Wiring only |
| `src/components/ManageParcels.tsx` | Added optional `autoOpenAdd` and `onParcelCreated` props; deep-link effect; fire `onParcelCreated` on successful create | Wiring only |
| `src/i18n.ts` | Added 2 missing keys (`parcelNameRequired`, `parcelCropRequired`) in EN + TA | Additive i18n |

**No backend files changed. No API contracts changed. No styling, class names, layout,
or visual design changed. No existing feature removed.**

---

## 3. Wiring Fixes

### 3.1 Manage Farm → existing `ManageParcels` screen

```tsx
onManageFarm={() => setSubview({ name: 'manageParcels' })}
```

Uses the pre-existing `ClaimsSubview` state machine that already had a `manageParcels`
branch rendering `<ManageParcels />`. No new screen, no new route, no page reload —
`subview` is local React state.

### 3.2 Add First Parcel → existing Add Parcel modal, opened directly

```tsx
onAddFirstParcel={() =>
  setSubview({ name: 'manageParcels', autoOpenAdd: true, returnToWizard: true })
}
```

`ManageParcels` gained an optional `autoOpenAdd` prop. Because the Add Parcel modal is
already part of `ManageParcels`' own render tree, opening it directly reuses the exact
existing form — no new flow was created:

```tsx
// src/components/ManageParcels.tsx
useEffect(() => {
  if (!autoOpenAdd || status !== 'ready') return;
  setName('');
  setCrop('');
  setGeometry(null);
  setSubmitError(null);
  setEditingParcel(null);
  setShowAddModal(true);
}, [autoOpenAdd, status]);
```

It waits for `status === 'ready'` so the user never sees the modal flash over the
loading spinner.

### 3.3 Return to wizard after saving, with auto-select → Step 2

`ManageParcels` now reports successful **creation** (not edit, not delete):

```tsx
// after create succeeds
closeModal();
await loadParcels();
onParcelsChange();
if (!editingParcel) onParcelCreated?.();
```

`ClaimsPage` handles it by refreshing the shared parcel list and returning to the wizard:

```tsx
const handleManageParcelsCreated = useCallback(() => {
  setParcelRetryKey(k => k + 1);
  setSubview({ name: 'new' });
}, []);
```

`parcelRetryKey` is already the existing dependency of the `listParcels()` effect
(`src/components/ClaimsPage.tsx:72`), so bumping it re-fetches without a page reload.

On remount the wizard's pre-existing single-parcel effect fires
(`src/components/ClaimWizard.tsx:65-71`), auto-selects the new parcel and dispatches
`next` — landing the user on **Step 2 (Event)**:

```tsx
useEffect(() => {
  if (parcelsStatus === 'ready' && parcels.length === 1 &&
      draft.step === 'parcel' && !draft.parcelId) {
    const singleParcel = parcels[0];
    dispatch({ type: 'select.parcel', parcelId: singleParcel.parcelId, geometry: singleParcel.geometry });
    dispatch({ type: 'next' });
  }
}, [parcels, parcelsStatus, draft.step, draft.parcelId]);
```

The wizard was blocked on Step 1 with nothing selected, so remounting at Step 1 and
auto-advancing to Step 2 loses no user input.

`onClose` is also direction-aware, so the back arrow from the parcel manager returns to
the wizard rather than dropping the user at the claims list:

```tsx
onClose={() => setSubview(subview.returnToWizard ? { name: 'new' } : { name: 'list' })}
```

### 3.4 Missing i18n keys

`validateForm()` in `ManageParcels` sets `submitError` to `parcelNameRequired` and
`parcelCropRequired`, but neither key existed in `src/i18n.ts` — those errors would
render as the raw key strings. Both were added in English and Tamil. These are the only
keys the wired path was missing.

---

## 4. Test Results

### Frontend — `tn-farming-assistant-frontend`

| Gate | Command | Result |
|------|---------|--------|
| Typecheck | `npm run typecheck` | **PASS** for all application code |
| Lint | `npm run lint` | **PASS** — 0 errors, 2 warnings |
| Tests | `npm test` | **PASS** — 175/175, 9/9 files |
| Build | `npm run build` | **PASS** — 1535 modules, 462.98 kB (gzip 135.06 kB) |

- Lint warnings are the **2 pre-existing** `react-refresh/only-export-components`
  warnings in `ClaimStatusCard.tsx:26` and `AuthContext.tsx:37`. The hotfix introduced
  one new `exhaustive-deps` warning, which was resolved; the count is unchanged from
  baseline.
- Typecheck reports 10 errors confined to `src/api/admin.test.ts` and
  `src/utils/adminQueue.test.ts`. These are **pre-existing and untouched** by this
  hotfix (stale admin DTO fixtures: `claimId`, `parcelName`, `claims`, `reason`,
  `overrideKey`, `toState`, `appealStatus`). No error exists in any file this hotfix
  modified. No test was weakened or deleted.

### Backend — `tn-farming-assistant`

| Gate | Command | Result |
|------|---------|--------|
| Regression suite | `npm test` | **PASS** — 425/425 tests, 14/14 files, 0 failures |

Getting there required two environment repairs, **neither of which touched source**:

1. `vitest` was listed in `devDependencies` but never installed. Installed with
   `--no-save --legacy-peer-deps` (the backend has a pre-existing `zod` v4 vs
   `@browserbasehq/stagehand` v3 peer conflict that blocks a plain `npm install`).
2. `mongodb-memory-server` could not download its `mongod` binary within the 120 s hook
   timeout, producing 7 spurious `Hook timed out in startTestDatabase()` failures. After
   the binary finished caching, all 7 files passed. **No assertion ever failed.**

Verified **no backend file was modified** — only `node_modules` timestamps changed.

---

## 5. End-to-End Verification

| Scenario | Expected | Result |
|----------|----------|--------|
| **A** — no parcels → Add First Parcel | Opens existing parcel creation; on save returns to wizard; parcel auto-selected; Event step opens | **PASS (navigation)** — verified by code path. See caveat below. |
| **B** — Manage Farm | Opens existing `ManageParcels` screen | **PASS** — verified |
| **C** — after creating a parcel | Claims immediately sees the new parcel, no refresh | **PASS** — `parcelRetryKey` bump re-fetches via existing effect |
| **D** — existing user, one parcel | Wizard skips parcel selection | **PASS** — existing auto-select effect untouched, still covered by `claimFlow.test.ts` (58 tests) |

### Verification method

The repository has **no component/render test infrastructure** — `vitest.config.ts` sets
`environment: 'node'`, there are zero `.test.tsx` files, and `@testing-library/react` is
not a dependency. Scenarios A–D were therefore verified by tracing the code path and
confirming the gates compile, lint, and pass, not by simulated clicks. Adding a render
harness would have meant new dependencies and config changes, outside the scope of a
wiring-only hotfix.

### ⚠️ Caveat on Scenario A — pre-existing blocker, NOT a wiring defect

Scenario A completes through navigation and auto-select, but **cannot be clicked
end-to-end in a browser today**, for a reason that predates and is outside this hotfix:

`validateForm()` in `ManageParcels.tsx:107-110` hard-requires `geometry`:

```ts
if (!geometry) {
  setSubmitError('boundaryRequired');
  return false;
}
```

Nothing in the application can set `geometry` for a new parcel. The boundary control is a
placeholder `<div>` with **no `onClick`** and the literal text "Map drawing integration
coming soon" (`ManageParcels.tsx:392-411`). `setGeometry` is reachable only from
`resetForm()` (`null`) and `openEditModal()` (an already-persisted parcel's value).

An exhaustive repo sweep confirmed:

- **No** map or drawing component exists anywhere in `src/`.
- **No** mapping library is installed — no leaflet, mapbox-gl, react-map-gl,
  @react-google-maps, openlayers, or turf, directly or transitively.
- **No** default/sample polygon helper or constant exists outside two test fixtures.
- `createParcel` is called from exactly one place (`ManageParcels.tsx:140`) and is
  unreachable for new parcels.

The codebase documents this as a deliberate deferral — `src/utils/claimFlow.ts:11-13`
cites *"ADR-019 P8 — no map yet"*, and `AreaStep` is commented
*"map drawing is deferred"*.

Fixing this requires adding a mapping library and building a boundary-drawing surface:
new dependencies, new UI, and real geospatial behaviour. That is expressly outside a
*"wiring only / do not change styling"* hotfix, and it is a separate piece of work. I did
**not** fabricate a placeholder polygon, because silently inventing parcel boundaries
would corrupt the acreage that the backend computes authoritatively and that the claims
verification engine depends on.

**Recommended follow-up:** implement the ADR-019 P8 map/drawing surface, or have the
backend accept a parcel without geometry and derive the boundary another way. The wiring
is now correct and will work the moment geometry can be set — no further wiring changes
will be needed.

---

## 6. Regression Safety

- The single-parcel auto-select effect was **not modified** — only its triggering
  condition is now reachable after a fresh parcel is created.
- `parcelRetryKey` reuse means the existing fetch effect and its cleanup/active-guard
  logic are unchanged.
- `ManageParcels` gained two **optional** props; all existing call sites
  (`App.tsx` global modal, navbar flow, claims list) behave identically without them.
- `ClaimsSubview` only gained optional fields on the existing `manageParcels` variant;
  the other three variants are byte-identical.
- Edit and delete paths explicitly do **not** trigger `onParcelCreated`, so the
  "return to wizard" behaviour is scoped to parcel creation only.
- The full frontend (175) and backend (425) suites pass with no test modified or removed.

---

## 7. READY FOR REVIEW: **NO**

The button wiring is **complete and verified** — root cause fixed, no regressions, all
gates green, backend clean. But I cannot certify READY FOR REVIEW while the stated
acceptance path for **Scenario A** is unreachable in a browser, because parcel geometry
cannot be set by any existing UI. That is a pre-existing gap requiring a mapping library
and a new drawing surface, which this wiring-only hotfix was scoped to exclude.

**Ready to review as:** button wiring fix (complete).
**Blocking full sign-off:** ADR-019 P8 parcel boundary capture — separate scoped task.

No commit. No push. No deploy.
