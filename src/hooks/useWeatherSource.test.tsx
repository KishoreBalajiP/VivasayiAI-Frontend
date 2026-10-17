import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { createMemoryStorage } from '../test/memoryStorage';
import { WEATHER_SOURCE_KEY, readWeatherSource, useWeatherSource } from './useWeatherSource';

beforeEach(() => {
  vi.stubGlobal('localStorage', createMemoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useWeatherSource', () => {
  it('LOC-13: defaults to the farm district', () => {
    const { result } = renderHook(() => useWeatherSource());
    expect(result.current[0]).toBe('farm');
  });

  it('LOC-13: the choice is saved and restored on the next visit', () => {
    const first = renderHook(() => useWeatherSource());
    act(() => first.result.current[1]('device'));
    expect(first.result.current[0]).toBe('device');
    expect(localStorage.getItem(WEATHER_SOURCE_KEY)).toBe('device');
    first.unmount();

    const second = renderHook(() => useWeatherSource());
    expect(second.result.current[0]).toBe('device');
  });

  it('LOC-13: a garbage value or unavailable storage falls back to farm', () => {
    localStorage.setItem(WEATHER_SOURCE_KEY, 'satellite');
    expect(readWeatherSource()).toBe('farm');

    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    const { result } = renderHook(() => useWeatherSource());
    expect(result.current[0]).toBe('farm');
    act(() => result.current[1]('device')); // must not throw
    expect(result.current[0]).toBe('device');
  });
});
