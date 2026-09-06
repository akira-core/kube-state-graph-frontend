import { createContext, useContext, type JSX, type ReactNode } from 'react';

import { DARK_TOKENS, type ThemeTokens } from '../../shared/theme/tokens';

import { useThemeController, type ThemeChoice, type ThemeController } from './useThemeController';

const ThemeTokensContext = createContext<ThemeTokens>(DARK_TOKENS);
const ThemeControllerContext = createContext<ThemeController | null>(null);

export function ThemeProvider({
  configTheme,
  children,
}: Readonly<{
  configTheme?: ThemeChoice;
  children: ReactNode;
}>): JSX.Element {
  const controller = useThemeController(configTheme);
  return (
    <ThemeControllerContext.Provider value={controller}>
      <ThemeTokensContext.Provider value={controller.tokens}>{children}</ThemeTokensContext.Provider>
    </ThemeControllerContext.Provider>
  );
}

export function useThemeTokens(): ThemeTokens {
  return useContext(ThemeTokensContext);
}

export function useOptionalThemeController(): ThemeController | null {
  return useContext(ThemeControllerContext);
}

export function useRequiredThemeController(): ThemeController {
  const value = useContext(ThemeControllerContext);
  if (value === null) {
    throw new Error('useRequiredThemeController requires ThemeProvider');
  }
  return value;
}
