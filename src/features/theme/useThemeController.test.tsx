import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { DARK_TOKENS, LIGHT_TOKENS } from '../../shared/theme/tokens';

import { THEME_STORAGE_KEY, resolveEffectiveMode, useThemeController } from './useThemeController';

function stubMatchMedia(matches: boolean): { dispatch: (next: boolean) => void } {
  const listeners = new Set<(ev: MediaQueryListEvent) => void>();
  let current = matches;
  const mq = {
    get matches() {
      return current;
    },
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: (_type: string, listener: EventListener) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: EventListener) => {
      listeners.delete(listener);
    },
    dispatchEvent: () => true,
  };
  window.matchMedia = () => mq as MediaQueryList;
  return {
    dispatch: (next: boolean) => {
      current = next;
      const ev = { matches: next } as MediaQueryListEvent;
      for (const listener of listeners) {
        listener(ev);
      }
    },
  };
}

describe('resolveEffectiveMode', () => {
  it('prefers the stored user choice over config and system', () => {
    expect(resolveEffectiveMode('dark', 'light', false)).toBe('dark');
  });

  it('uses config theme when the user has not chosen', () => {
    expect(resolveEffectiveMode(null, 'light', true)).toBe('light');
  });

  it('falls back to system when neither user nor config set a concrete theme', () => {
    expect(resolveEffectiveMode(null, undefined, true)).toBe('dark');
    expect(resolveEffectiveMode(null, 'system', false)).toBe('light');
  });
});

describe('useThemeController', () => {
  const mem = new Map<string, string>();
  beforeEach(() => {
    mem.clear();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => mem.get(key) ?? null,
        setItem: (key: string, value: string) => {
          mem.set(key, value);
        },
        removeItem: (key: string) => {
          mem.delete(key);
        },
        clear: () => mem.clear(),
        key: () => null,
        get length() {
          return mem.size;
        },
      },
    });
  });
  afterEach(() => {
    document.documentElement.classList.remove('dark');
  });

  it('applies a stored user choice over config theme', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    stubMatchMedia(false);
    const { result } = renderHook(() => useThemeController('light'));
    expect(result.current.effective).toBe('dark');
    expect(result.current.tokens).toBe(DARK_TOKENS);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('uses the config theme when nothing is stored', () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useThemeController('light'));
    expect(result.current.effective).toBe('light');
    expect(result.current.tokens).toBe(LIGHT_TOKENS);
    expect(result.current.selection).toBe('light');
  });

  it('follows system preference changes while selection is system', () => {
    const media = stubMatchMedia(false);
    const { result } = renderHook(() => useThemeController('system'));
    expect(result.current.effective).toBe('light');
    act(() => {
      media.dispatch(true);
    });
    expect(result.current.effective).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('persists a user selection', () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useThemeController('system'));
    act(() => {
      result.current.setChoice('dark');
    });
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(result.current.selection).toBe('dark');
    expect(result.current.effective).toBe('dark');
  });
});
