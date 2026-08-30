import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import { DARK_TOKENS, LIGHT_TOKENS, type ThemeMode, type ThemeTokens } from '../../shared/theme/tokens';
import type { ConfigTheme } from '../runtime-config';

export type ThemeChoice = ConfigTheme;

export const THEME_STORAGE_KEY = 'ksg.theme';

function readStoredChoice(): ThemeChoice | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    if (value === 'dark' || value === 'light' || value === 'system') {
      return value;
    }
  } catch {
    return null;
  }
  return null;
}

function subscribeSystem(onStoreChange: () => void): () => void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', onStoreChange);
  return () => mq.removeEventListener('change', onStoreChange);
}

function getSystemDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolveEffectiveMode(
  userChoice: ThemeChoice | null,
  configTheme: ThemeChoice | undefined,
  systemDark: boolean
): ThemeMode {
  const choice = userChoice ?? configTheme ?? 'system';
  if (choice === 'system') {
    return systemDark ? 'dark' : 'light';
  }
  return choice;
}

export interface ThemeController {
  tokens: ThemeTokens;
  effective: ThemeMode;
  selection: ThemeChoice;
  setChoice: (choice: ThemeChoice) => void;
}

export function useThemeController(configTheme?: ThemeChoice): ThemeController {
  const [userChoice, setUserChoice] = useState<ThemeChoice | null>(() => readStoredChoice());
  const systemDark = useSyncExternalStore(subscribeSystem, getSystemDark, () => false);
  const effective = resolveEffectiveMode(userChoice, configTheme, systemDark);
  const tokens = effective === 'dark' ? DARK_TOKENS : LIGHT_TOKENS;
  const selection: ThemeChoice = userChoice ?? configTheme ?? 'system';

  useEffect(() => {
    document.documentElement.classList.toggle('dark', effective === 'dark');
  }, [effective]);

  const setChoice = useCallback((choice: ThemeChoice) => {
    setUserChoice(choice);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, choice);
    } catch {
      // Ignore quota / private-mode failures; the in-memory choice still applies.
    }
  }, []);

  return { tokens, effective, selection, setChoice };
}
