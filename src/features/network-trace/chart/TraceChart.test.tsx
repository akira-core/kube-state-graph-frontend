import { render, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { DARK_TOKENS } from '../../../shared/theme/tokens';
import { normalizeGraph } from '../../graph-data';
import type { HoverLit, Viewport } from '../../sankey-canvas';
import { layoutTrace } from '../layout/layoutTrace';
import { deriveTrace } from '../model/deriveTrace';
import type { TraceModelOk } from '../model/types';
import { TRACE_SAMPLE_CLASSIC } from '../testing/samples';

import { TraceCard } from './TraceCards';
import { TraceChart } from './TraceChart';

// The real card, wrapped so its render count can be read: how many times the drawing
// reconciled is how many times a card was called.
vi.mock('./TraceCards', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./TraceCards')>();
  return { ...actual, TraceCard: vi.fn(actual.TraceCard) };
});

const noop = (): void => undefined;
const hostProps = { ref: noop, onPointerDown: noop, onPointerMove: noop, onPointerUp: noop, onPointerCancel: noop };

function classicModel(): TraceModelOk {
  const model = deriveTrace(normalizeGraph(TRACE_SAMPLE_CLASSIC.wire).elements, {
    direction: TRACE_SAMPLE_CLASSIC.direction,
  });
  if (!model.ok) {
    throw new Error(model.errors.join('; '));
  }
  return model;
}

function cardRenders(): number {
  return vi.mocked(TraceCard).mock.calls.length;
}

describe('TraceChart', () => {
  it('sits out a pan frame: a new viewport moves the canvas transform without re-rendering a card', () => {
    const model = classicModel();
    const geo = layoutTrace(model, { order: 'flow' });
    const chart = (viewport: Viewport, lit: HoverLit | null = null): JSX.Element => (
      <TraceChart
        model={model}
        geo={geo}
        tokens={DARK_TOKENS}
        viewport={viewport}
        hostProps={hostProps}
        dragging={false}
        lit={lit}
        onNodeEnter={noop}
        onNodeLeave={noop}
        onBandEnter={noop}
        onBandLeave={noop}
        onResidualEnter={noop}
        onResidualLeave={noop}
        onKeyDown={noop}
      />
    );
    const transform = (): string | null | undefined =>
      screen.getByTestId('sankey-svg').querySelector('g')?.getAttribute('transform');

    const { rerender } = render(chart({ scale: 1, tx: 0, ty: 0 }));
    expect(cardRenders()).toBe(model.nodes.length);

    rerender(chart({ scale: 1, tx: 40, ty: 8 }));
    expect(transform()).toBe('translate(40,8) scale(1)');
    expect(cardRenders()).toBe(model.nodes.length);

    // A hover does reach the cards: every one decides its own opacity from `lit`.
    rerender(chart({ scale: 1, tx: 40, ty: 8 }, { keys: new Set(), nodeIds: new Set() }));
    expect(cardRenders()).toBe(2 * model.nodes.length);
  });
});
