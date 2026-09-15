import { describe, expect, it } from 'vitest';

import { unionRect } from './geometry';
import {
  fitRectViewport,
  fitViewport,
  MAX_SCALE,
  MIN_SCALE,
  oneToOneViewport,
  openingViewport,
  zoomAroundPoint,
} from './useZoomPan';

function screenPositionOf(contentPoint: { x: number; y: number }, v: { scale: number; tx: number; ty: number }) {
  return { x: v.tx + contentPoint.x * v.scale, y: v.ty + contentPoint.y * v.scale };
}

describe('zoomAroundPoint', () => {
  it('keeps the content point under the anchor fixed on screen', () => {
    const v = { scale: 1, tx: -20, ty: 10 };
    const anchor = { x: 130, y: 80 };
    const contentPoint = { x: (anchor.x - v.tx) / v.scale, y: (anchor.y - v.ty) / v.scale };
    const before = screenPositionOf(contentPoint, v);
    const after = zoomAroundPoint(v, anchor, 2.4);
    const afterScreen = screenPositionOf(contentPoint, after);
    expect(afterScreen.x).toBeCloseTo(before.x, 6);
    expect(afterScreen.y).toBeCloseTo(before.y, 6);
    expect(afterScreen.x).toBeCloseTo(anchor.x, 6);
    expect(afterScreen.y).toBeCloseTo(anchor.y, 6);
  });

  it('clamps to the scale bounds instead of exceeding them', () => {
    const v = { scale: 1, tx: 0, ty: 0 };
    const huge = zoomAroundPoint(v, { x: 0, y: 0 }, 1000);
    expect(huge.scale).toBe(MAX_SCALE);
    const tiny = zoomAroundPoint(v, { x: 0, y: 0 }, 0.0001);
    expect(tiny.scale).toBe(MIN_SCALE);
  });

  it('is a no-op once already at a bound', () => {
    const atMax = { scale: MAX_SCALE, tx: 5, ty: 5 };
    expect(zoomAroundPoint(atMax, { x: 0, y: 0 }, 10)).toEqual(atMax);
  });
});

describe('fitViewport / oneToOneViewport / openingViewport', () => {
  it('fit scales a large diagram down to cover the container, centered', () => {
    const v = fitViewport({ w: 2000, h: 1000 }, { w: 800, h: 500 });
    expect(v.scale).toBeCloseTo(0.4, 5);
    expect(v.tx).toBeCloseTo(0, 5);
    expect(v.ty).toBeCloseTo(50, 5); // (500 - 1000*0.4) / 2
  });

  it('fit can enlarge a small diagram past 1:1', () => {
    const v = fitViewport({ w: 200, h: 100 }, { w: 800, h: 500 });
    expect(v.scale).toBeGreaterThan(1);
  });

  it('opening view never enlarges past 1:1, even when fit would', () => {
    const content = { w: 200, h: 100 };
    const container = { w: 800, h: 500 };
    const opening = openingViewport(content, container);
    expect(opening.scale).toBe(1);
    expect(opening).toEqual(oneToOneViewport(content, container));
  });

  it('opening view matches fit when the diagram is larger than the container', () => {
    const content = { w: 2000, h: 1000 };
    const container = { w: 800, h: 500 };
    expect(openingViewport(content, container)).toEqual(fitViewport(content, container));
  });
});

describe('fitRectViewport', () => {
  const container = { w: 800, h: 500 };

  it('centres a small rect at 1:1 instead of enlarging it', () => {
    const rect = { x: 100, y: 200, w: 208, h: 60 };
    const v = fitRectViewport(rect, container);
    expect(v.scale).toBe(1);
    const centre = screenPositionOf({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }, v);
    expect(centre.x).toBeCloseTo(400, 6);
    expect(centre.y).toBeCloseTo(250, 6);
  });

  it('scales a large rect down to fit inside the padding', () => {
    const v = fitRectViewport({ x: 0, y: 0, w: 1440, h: 300 }, container, { padding: 40 });
    expect(v.scale).toBeCloseTo(0.5, 6); // (800 - 80) / 1440
    expect(v.tx).toBeCloseTo(40, 6);
  });

  it('clamps to MIN_SCALE and tolerates a zero-size rect or container', () => {
    expect(fitRectViewport({ x: 0, y: 0, w: 1e6, h: 10 }, container).scale).toBe(MIN_SCALE);
    expect(fitRectViewport({ x: 10, y: 10, w: 0, h: 0 }, container).scale).toBe(1);
    expect(fitRectViewport({ x: 10, y: 10, w: 50, h: 50 }, { w: 0, h: 0 })).toEqual({ scale: 1, tx: 0, ty: 0 });
  });
});

describe('unionRect', () => {
  it('encloses every rect, or is null for none', () => {
    expect(
      unionRect([
        { x: 10, y: 20, w: 5, h: 5 },
        { x: -4, y: 30, w: 10, h: 40 },
      ])
    ).toEqual({ x: -4, y: 20, w: 19, h: 50 });
    expect(unionRect([])).toBeNull();
  });
});
