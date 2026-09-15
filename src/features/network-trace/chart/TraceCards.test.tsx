import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { DARK_TOKENS } from '../../../shared/theme/tokens';
import { normalizeGraph } from '../../graph-data';
import { layoutTrace } from '../layout/layoutTrace';
import { cardText } from '../layout/text';
import { deriveTrace } from '../model/deriveTrace';
import type { TraceLayout, TraceModelOk } from '../model/types';
import { TRACE_SAMPLES } from '../testing/samples';

import { TraceChart } from './TraceChart';

/**
 * Port of sankey-panel's `cards` test. `layout/text.ts` produces the line list (the card
 * height is its length) and the chart iterates the same list; this looks only at the
 * rendered result — every `<text>` inside a card must sit inside the card's frame, and
 * the number of drawn attribute lines must equal the number the text module counted.
 */
const noop = (): void => undefined;

function renderChart(model: TraceModelOk): string {
  const geo = layoutTrace(model, { order: 'flow' });
  return renderToStaticMarkup(
    <TraceChart
      model={model}
      geo={geo}
      tokens={DARK_TOKENS}
      viewport={{ scale: 1, tx: 0, ty: 0 }}
      hostProps={{ ref: noop, onPointerDown: noop, onPointerMove: noop, onPointerUp: noop, onPointerCancel: noop }}

      dragging={false}
      lit={null}
      onNodeEnter={noop}
      onNodeLeave={noop}
      onNodeClick={noop}
      onBandEnter={noop}
      onBandLeave={noop}
      onResidualEnter={noop}
      onResidualLeave={noop}
      onKeyDown={noop}
    />
  );
}

function cardsOf(markup: string): Element[] {
  const doc = new DOMParser().parseFromString(markup, 'text/html');
  return [...doc.querySelectorAll('g[data-testid^="trace-node-"]')];
}

function num(el: Element | null, attr: string): number {
  const raw = el?.getAttribute(attr);
  expect(raw, `${attr} missing`).toBeTruthy();
  return Number(raw);
}

interface Case {
  name: string;
  model: TraceModelOk;
}

function cases(): Case[] {
  const out: Case[] = [];
  const variants: Array<{ tag: string; minBps: number; layout: TraceLayout }> = [
    { tag: '', minBps: 0, layout: 'flat' },
    { tag: '@5e8', minBps: 5e8, layout: 'flat' },
    { tag: '@node', minBps: 0, layout: 'node' },
  ];
  for (const sample of TRACE_SAMPLES) {
    const elements = normalizeGraph(sample.wire).elements;
    for (const v of variants) {
      const model = deriveTrace(elements, { direction: sample.direction, minBps: v.minBps, layout: v.layout });
      expect(model.ok, `${sample.key}${v.tag}`).toBe(true);
      if (model.ok) {
        out.push({ name: `${sample.key}${v.tag}`, model });
      }
    }
  }
  return out;
}

describe('TraceCards', () => {
  it('keeps every text of every card inside its frame (the drawn lines fit the computed height)', () => {
    let checked = 0;
    for (const { name, model } of cases()) {
      for (const card of cardsOf(renderChart(model))) {
        const id = card.getAttribute('data-testid') ?? '';
        const rect = card.querySelector('rect');
        expect(rect, `${name} ${id}: no <rect> in the card`).not.toBeNull();
        const top = num(rect, 'y');
        const h = num(rect, 'height');
        const ys = [...card.querySelectorAll('text')].map((t) => num(t, 'y'));
        expect(ys.length, `${name} ${id}: a card with no text`).toBeGreaterThan(0);
        for (const y of ys) {
          expect(y, `${name} ${id}: text y=${String(y)} above the frame top ${String(top)}`).toBeGreaterThanOrEqual(
            top - 0.5
          );
          expect(y, `${name} ${id}: text y=${String(y)} below the frame bottom ${String(top + h)}`).toBeLessThanOrEqual(
            top + h + 0.5
          );
        }
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('draws exactly the attribute lines layout/text.ts counted, for every card', () => {
    let checked = 0;
    for (const { name, model } of cases()) {
      const cards = cardsOf(renderChart(model));
      expect(cards, `${name}: one <g> per model node`).toHaveLength(model.nodes.length);
      model.nodes.forEach((n, i) => {
        const card = cards[i];
        expect(card).toBeDefined();
        if (card === undefined) {
          return;
        }
        const text = cardText(n, model);
        expect(card.getAttribute('data-testid')).toBe(`trace-node-${text.label !== '' ? text.label : n.id}`);
        const drawn = card.querySelectorAll('[data-testid="sankey-card-line"]').length;
        expect(drawn, `${name} ${n.id} (${n.kind}/${n.role}): drew ${String(drawn)} lines`).toBe(
          text.extraLines.length
        );
        checked += 1;
      });
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('labels a hop card with data-kind, data-status and data-locatable', () => {
    const k8s = cases().find((c) => c.name === 'k8s@node');
    expect(k8s).toBeDefined();
    if (k8s === undefined) {
      return;
    }
    const markup = renderChart(k8s.model);
    const cards = cardsOf(markup);
    const hop = cards.find((c) => c.getAttribute('data-testid') === 'trace-node-ToR k8s');
    expect(hop?.getAttribute('data-kind')).toBe('switch');
    expect(hop?.getAttribute('data-locatable')).toBe('true');
    const ns = cards.find((c) => c.getAttribute('data-kind') === 'ns');
    expect(ns?.getAttribute('data-locatable')).toBe('false');
    const doc = new DOMParser().parseFromString(markup, 'text/html');
    expect(doc.querySelectorAll('g[data-testid^="trace-wrapper-"]').length).toBe(k8s.model.wrappers.length);
    expect(doc.querySelectorAll('[data-testid="trace-residual-out"]').length).toBeGreaterThan(0);
  });

  it('draws one direction chevron per amount ribbon, none on an ownership line', () => {
    for (const c of cases().filter((x) => x.name === 'client' || x.name === 'dci-uturn')) {
      const doc = new DOMParser().parseFromString(renderChart(c.model), 'text/html');
      expect(doc.querySelectorAll('[data-testid="trace-band-chevron"]').length).toBe(
        c.model.edges.filter((e) => !e.owns).length
      );
    }
  });
});
