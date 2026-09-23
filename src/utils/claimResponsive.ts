// Mobile-first responsive helpers for the Claims UI (Phase 7).
// The app renders with Tailwind utility classes only (no JS breakpoint lib). These helpers
// mirror the stock Tailwind breakpoints used by the claim components (base = <640,
// sm = 640–1023, lg = 1024+) so the same decisions drive both the classes and (critically)
// the compact layouts that only appear on phones: whether claim cards collapse their secondary
// fields and whether the wizard step indicator becomes a "Step X of N" counter instead of a
// 6-step rail that cannot fit at 360 px.
//
// Pure and deterministic so the mandatory 360/390/430/tablet/desktop smoke matrix is testing
// the exact code path the UI runs — not a static snapshot of markup.

import { useEffect, useState } from 'react';

export interface ClaimsViewport {
  width: number;
  // witness: true below the sm breakpoint (360/390/430 phones).
  compact: boolean;
  // Claim card grid density: 1 column on phones, 2 on sm+, 3 on lg+.
  columns: 1 | 2 | 3;
  // Step indicator mode: 'rail' only when all wizard steps fit comfortably; 'count' otherwise.
  stepIndicator: 'rail' | 'count';
  // Whether the wizard review grid should stack into a single column.
  reviewStacked: boolean;
}

const SM_MIN = 640;
const LG_MIN = 1024;

export const resolveClaimsViewport = (width: number): ClaimsViewport => {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 0;
  const compact = safeWidth > 0 && safeWidth < SM_MIN;
  const columns = safeWidth >= LG_MIN ? 3 : safeWidth >= SM_MIN ? 2 : 1;
  // 6 wizard steps plus gaps need ~480 px; narrower screens get the compact counter.
  const stepIndicator = safeWidth >= 480 ? 'rail' : 'count';
  const reviewStacked = safeWidth < LG_MIN;
  return { width: safeWidth, compact, columns, stepIndicator, reviewStacked };
};

// Extracts the current viewport width in a browser (0 in non-browser/test contexts).
export const readViewportWidth = (): number =>
  typeof window !== 'undefined' && window.innerWidth ? window.innerWidth : 0;

// Reactive hook so the demo/claims UI recomputes on resize like any other responsive pattern.
export const useClaimsViewport = (): ClaimsViewport => {
  const [viewport, setViewport] = useState<ClaimsViewport>(() =>
    resolveClaimsViewport(readViewportWidth())
  );
  useEffect(() => {
    const recompute = () => setViewport(resolveClaimsViewport(readViewportWidth()));
    recompute();
    window.addEventListener('resize', recompute);
    return () => window.removeEventListener('resize', recompute);
  }, []);
  return viewport;
};