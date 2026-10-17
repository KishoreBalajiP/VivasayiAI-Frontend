import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { RETURN_TO_KEY } from './hashRoute';
import { consumeReturnTo, navigate, saveReturnTo, useHashRoute } from './useHashRoute';

// The hook reads the real jsdom location/history, so every test starts from a clean URL.
const resetUrl = () => window.history.replaceState(null, '', '/');

beforeEach(() => {
  resetUrl();
  sessionStorage.clear();
});

afterEach(() => {
  resetUrl();
});

describe('useHashRoute', () => {
  it('RT-3: navigate pushes a history entry; replace rewrites the current one', () => {
    const { result } = renderHook(() => useHashRoute());
    expect(result.current.route).toEqual({ section: 'chat' });

    const start = window.history.length;
    act(() => navigate({ section: 'claims', view: 'list' }));
    expect(window.location.hash).toBe('#/claims');
    expect(window.history.length).toBe(start + 1);
    expect(result.current.route).toEqual({ section: 'claims', view: 'list' });

    act(() => navigate({ section: 'claims', view: 'detail', claimId: 'c_1' }, { replace: true }));
    expect(window.location.hash).toBe('#/claims/c_1');
    expect(window.history.length).toBe(start + 1); // replaced, not pushed
    expect(result.current.route).toEqual({ section: 'claims', view: 'detail', claimId: 'c_1' });
  });

  it('RT-3: navigating to the route already shown adds no history entry', () => {
    renderHook(() => useHashRoute());
    act(() => navigate({ section: 'admin' }));
    const length = window.history.length;
    act(() => navigate({ section: 'admin' }));
    expect(window.history.length).toBe(length);
  });

  it('RT-4: a hashchange from outside (Back/Forward, a typed URL) updates the route', async () => {
    const { result } = renderHook(() => useHashRoute());
    act(() => {
      window.location.hash = '#/claims/new';
    });
    await waitFor(() => expect(result.current.route).toEqual({ section: 'claims', view: 'new' }));

    // Browser Back to the previous entry.
    act(() => window.history.back());
    await waitFor(() => expect(result.current.route).toEqual({ section: 'chat' }));
  });

  it('RT-4: every subscriber sees the same route', () => {
    const a = renderHook(() => useHashRoute());
    const b = renderHook(() => useHashRoute());
    act(() => navigate({ section: 'claims', view: 'detail', claimId: 'abc' }));
    expect(a.result.current.route).toEqual(b.result.current.route);
  });
});

describe('returnTo storage', () => {
  it('RT-5: saveReturnTo stores the current in-app route and consumeReturnTo clears it', () => {
    window.history.replaceState(null, '', '/#/claims/c_9');
    saveReturnTo();
    expect(sessionStorage.getItem(RETURN_TO_KEY)).toBe('#/claims/c_9');
    expect(consumeReturnTo()).toBe('#/claims/c_9');
    expect(sessionStorage.getItem(RETURN_TO_KEY)).toBeNull();
    expect(consumeReturnTo()).toBeNull();
  });

  it('RT-5: an unsafe stored value is never returned, and an unsafe hash clears an old value', () => {
    sessionStorage.setItem(RETURN_TO_KEY, 'https://evil.example/#/claims');
    expect(consumeReturnTo()).toBeNull();

    sessionStorage.setItem(RETURN_TO_KEY, '#/claims');
    saveReturnTo('#/not-a-route');
    expect(sessionStorage.getItem(RETURN_TO_KEY)).toBeNull();
  });
});
