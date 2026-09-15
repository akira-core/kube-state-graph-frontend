import { memo, type JSX } from 'react';

import type { ThemeTokens } from '../../shared/theme/tokens';
import { StatusLegend, Swatch } from '../sankey-canvas';

import type { TraceModelOk } from './model/types';

function Row({ children, testId }: Readonly<{ children: React.ReactNode; testId: string }>): JSX.Element {
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-secondary" data-testid={testId}>
      {children}
    </span>
  );
}

/**
 * What the chart's marks mean, listed only for marks actually on the chart: a legend row
 * for a backflow that is not drawn claims a ribbon kind the reader will look for in vain.
 * Memoised on the derived model and the theme, so the scans below sit out the pan and
 * hover renders.
 */
export const TraceLegend = memo(function TraceLegend({
  model,
  tokens,
}: Readonly<{ model: TraceModelOk; tokens: ThemeTokens }>): JSX.Element {
  const hasLateral = model.edges.some((e) => e.lateral);
  const hasBack = model.edges.some((e) => e.backward);
  const hasOwns = model.edges.some((e) => e.owns);
  const hasStatus = model.nodes.some((n) => n.status !== null) || model.clusters.some((c) => c.status !== null);
  return (
    <div className="flex flex-wrap items-center gap-3" data-testid="trace-legend">
      <Row testId="trace-legend-flow">
        <Swatch color={tokens.sankey.traceFlow} />
        traced Δ (width = rate increase, chevron = direction)
      </Row>
      {hasLateral && (
        <Row testId="trace-legend-lateral">
          <Swatch color={tokens.sankey.traceFlowEnd} />
          same-column interconnect (right-side arc, arrow shows direction)
        </Row>
      )}
      {hasBack && (
        <Row testId="trace-legend-back">
          <Swatch color={tokens.sankey.traceBackward} />
          backflow (against the majority direction)
        </Row>
      )}
      <Row testId="trace-legend-other-in">
        <Swatch color={tokens.sankey.traceResidualIn} dashed />
        other in (left, height ∝ amount)
      </Row>
      <Row testId="trace-legend-other-out">
        <Swatch color={tokens.sankey.traceResidualOut} dashed />
        other out (right)
      </Row>
      {hasOwns && (
        <Row testId="trace-legend-own">
          <Swatch color={tokens.fg.muted} dashed />
          ownership only (shared port, amount stays on the port)
        </Row>
      )}
      {hasStatus && (
        <>
          <span aria-hidden className="h-4 border-l border-medium" />
          <StatusLegend testIdPrefix="trace" />
        </>
      )}
    </div>
  );
});
