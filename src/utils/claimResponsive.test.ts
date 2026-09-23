import { describe, expect, it } from 'vitest';
import { resolveClaimsViewport } from './claimResponsive';

// MOBILE 33 — the mandatory phone/tablet/desktop smoke matrix for the Claims UI. The demo/claim
// components consume resolveClaimsViewport() directly, so these exact-width assertions exercise
// the SAME code path the rendered UI runs (Tailwind classes + wizard step-indicator mode + card
// grid density) — purely, deterministically, with no DOM needed.

describe('resolveClaimsViewport', () => {
  it('360 px (common phone) → compact single column, count step indicator, stacked review', () => {
    const vp = resolveClaimsViewport(360);
    expect(vp.width).toBe(360);
    expect(vp.compact).toBe(true);
    expect(vp.columns).toBe(1);
    expect(vp.stepIndicator).toBe('count'); // 6-step rail cannot fit at 360
    expect(vp.reviewStacked).toBe(true);
  });

  it('390 px (iPhone-class phone) stays compact', () => {
    const vp = resolveClaimsViewport(390);
    expect(vp.compact).toBe(true);
    expect(vp.columns).toBe(1);
    expect(vp.reviewStacked).toBe(true);
  });

  it('430 px (large phone) stays compact with count indicator', () => {
    const vp = resolveClaimsViewport(430);
    expect(vp.compact).toBe(true);
    expect(vp.columns).toBe(1);
    expect(vp.stepIndicator).toBe('count');
    expect(vp.reviewStacked).toBe(true);
  });

  it('639 px is still below the sm breakpoint (compact)', () => {
    const vp = resolveClaimsViewport(639);
    expect(vp.compact).toBe(true);
    expect(vp.columns).toBe(1);
  });

  it('640 px (sm) → two-column grid, rail step indicator, still stacked review', () => {
    const vp = resolveClaimsViewport(640);
    expect(vp.compact).toBe(false);
    expect(vp.columns).toBe(2);
    expect(vp.stepIndicator).toBe('rail');
    expect(vp.reviewStacked).toBe(true);
  });

  it('768 px (tablet portrait) is not compact with two columns', () => {
    const vp = resolveClaimsViewport(768);
    expect(vp.compact).toBe(false);
    expect(vp.columns).toBe(2);
    expect(vp.stepIndicator).toBe('rail');
    expect(vp.reviewStacked).toBe(true);
  });

  it('1023 px is still two columns / stacked review (below lg)', () => {
    const vp = resolveClaimsViewport(1023);
    expect(vp.columns).toBe(2);
    expect(vp.reviewStacked).toBe(true);
  });

  it('1024 px (lg) → three columns and a spread review grid', () => {
    const vp = resolveClaimsViewport(1024);
    expect(vp.compact).toBe(false);
    expect(vp.columns).toBe(3);
    expect(vp.stepIndicator).toBe('rail');
    expect(vp.reviewStacked).toBe(false);
  });

  it('1440 px (desktop) keeps three columns', () => {
    const vp = resolveClaimsViewport(1440);
    expect(vp.columns).toBe(3);
    expect(vp.reviewStacked).toBe(false);
  });

  it('handles the honest edge case where width is unknown (0)', () => {
    const vp = resolveClaimsViewport(0);
    expect(vp.compact).toBe(false);
    expect(vp.reviewStacked).toBe(true); // conservative: stacked until we know it is wide
    expect(vp.width).toBe(0);
  });

  it('rejects non-finite widths defensively', () => {
    const vp = resolveClaimsViewport(Number.NaN);
    expect(vp.width).toBe(0);
    expect(vp.compact).toBe(false);
  });
});