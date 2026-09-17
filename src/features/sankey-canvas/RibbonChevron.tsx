import type { JSX } from 'react';

import type { ThemeTokens } from '../../shared/theme/tokens';

export interface RibbonChevronProps {
  /** The path from `endChevronPath`. */
  d: string;
  tokens: ThemeTokens;
  /** On the lit path, or nothing is lit; otherwise faded with its ribbon. */
  active: boolean;
  testId: string;
}

/**
 * The direction mark inside a ribbon's target end, drawn after the ribbon it belongs to.
 * Stroked in the text colour: the ribbon there is its gradient's end colour, which a filled
 * mark of the same family would vanish into.
 */
export function RibbonChevron({ d, tokens, active, testId }: Readonly<RibbonChevronProps>): JSX.Element {
  return (
    <path
      d={d}
      fill="none"
      stroke={tokens.fg.primary}
      strokeOpacity={active ? 0.9 : 0.2}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="pointer-events-none"
      data-testid={testId}
    />
  );
}
