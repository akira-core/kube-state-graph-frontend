import { useMemo } from 'react';

import { getStylesheet, type CyStylesheet } from '../graph-canvas';

import { useThemeTokens } from './ThemeContext';

export function useGraphTheme(): CyStylesheet[] {
  const tokens = useThemeTokens();
  return useMemo(() => getStylesheet({ theme: tokens }), [tokens]);
}
