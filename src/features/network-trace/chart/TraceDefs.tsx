import type { JSX } from 'react';

import type { ThemeTokens } from '../../../shared/theme/tokens';

export const FLOW_GRADIENT_ID = 'ksg-trace-grad-flow';
export const BACK_GRADIENT_ID = 'ksg-trace-grad-back';

/** The two ribbon gradients, in the storage chart's read / write gradient idiom. */
export function TraceDefs({ tokens }: Readonly<{ tokens: ThemeTokens }>): JSX.Element {
  return (
    <>
      <linearGradient id={FLOW_GRADIENT_ID} x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stopColor={tokens.sankey.traceFlow} />
        <stop offset="1" stopColor={tokens.sankey.traceFlowEnd} />
      </linearGradient>
      <linearGradient id={BACK_GRADIENT_ID} x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stopColor={tokens.sankey.traceBackward} />
        <stop offset="1" stopColor={tokens.sankey.traceBackwardEnd} />
      </linearGradient>
    </>
  );
}
