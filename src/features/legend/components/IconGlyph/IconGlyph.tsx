import type { JSX } from 'react';

import { iconSvgForKind } from '../../../../shared/constants/iconSvgByKind';
import { tintSvgToDataUri } from '../../../../shared/icon/tintSvgToDataUri';
import { themeColors } from '../../../../shared/theme/tokens';
import { useThemeTokens } from '../../../theme';

export interface IconGlyphProps {
  kind: string;
  size?: number;
}

const DEFAULT_SIZE = 26;

export function IconGlyph({ kind, size = DEFAULT_SIZE }: Readonly<IconGlyphProps>): JSX.Element {
  const tokens = useThemeTokens();
  const src = tintSvgToDataUri(iconSvgForKind(kind), themeColors(tokens).text.primary);
  return <img src={src} width={size} height={size} alt={`${kind} icon`} data-testid={`icon-glyph-${kind}`} />;
}
