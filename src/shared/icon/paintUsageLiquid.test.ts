import { STATUS_COLOR } from '../constants/colorByStatus';
import { ICON_SVG_BY_KIND } from '../constants/iconSvgByKind';

import { USAGE_FILL_OPACITY, paintUsageLiquid, usageFillColor, usageFillPaint } from './paintUsageLiquid';

const rectAttrs = (svg: string): { x: number; y: number; height: number; fill: string; opacity: string } => {
  const match = /<rect\b([^>]*)\/>/.exec(svg);
  const attrs = match?.[1] ?? '';
  const get = (name: string): string => {
    const m = new RegExp(`${name}="([^"]*)"`).exec(attrs);
    return m?.[1] ?? '';
  };
  return {
    x: Number(get('x')),
    y: Number(get('y')),
    height: Number(get('height')),
    fill: get('fill'),
    opacity: get('fill-opacity'),
  };
};

describe('usageFillColor', () => {
  it('is green below 80%, yellow at 80%, red at 90%', () => {
    expect(usageFillColor(0)).toBe(STATUS_COLOR.normal);
    expect(usageFillColor(0.79)).toBe(STATUS_COLOR.normal);
    expect(usageFillColor(0.8)).toBe(STATUS_COLOR.warning);
    expect(usageFillColor(0.89)).toBe(STATUS_COLOR.warning);
    expect(usageFillColor(0.9)).toBe(STATUS_COLOR.critical);
    expect(usageFillColor(1)).toBe(STATUS_COLOR.critical);
  });
});

describe('paintUsageLiquid', () => {
  it('keeps fill-opacity at 0.4 so cylinder strokes stay readable', () => {
    expect(USAGE_FILL_OPACITY).toBe(0.4);
    expect(rectAttrs(paintUsageLiquid(ICON_SVG_BY_KIND['netapp-aggr'], 0.7, 'netapp-aggr')).fill).toBe(
      usageFillPaint(0.7)
    );
    expect(usageFillPaint(0.7)).toContain('0.4');
  });

  it('fills 70% of the aggr cylinder with green, strokes after the liquid', () => {
    const out = paintUsageLiquid(ICON_SVG_BY_KIND['netapp-aggr'], 0.7, 'netapp-aggr');
    const rect = rectAttrs(out);
    expect(rect.fill).toBe(usageFillPaint(0.7));
    expect(rect.x).toBe(5);
    expect(rect.height).toBeCloseTo(17.8 * 0.7, 2);
    expect(rect.y + rect.height).toBeCloseTo(20.9, 2);
    expect(out).toContain('M5 9.8');
    expect(out).toContain('M5 14.1');
    expect(out.indexOf('rgba(')).toBeLessThan(out.indexOf('M5 9.8'));
  });

  it('uses warning at 0.8 and critical at 0.9', () => {
    expect(rectAttrs(paintUsageLiquid(ICON_SVG_BY_KIND.pvc, 0.8, 'pvc')).fill).toBe(usageFillPaint(0.8));
    expect(rectAttrs(paintUsageLiquid(ICON_SVG_BY_KIND.pvc, 0.9, 'pvc')).fill).toBe(usageFillPaint(0.9));
  });

  it('stays green at 0.79', () => {
    expect(rectAttrs(paintUsageLiquid(ICON_SVG_BY_KIND.pvc, 0.79, 'pvc')).fill).toBe(usageFillPaint(0.79));
  });

  it('keeps pvc liquid inside the cylinder walls', () => {
    const rect = rectAttrs(paintUsageLiquid(ICON_SVG_BY_KIND.pvc, 0.5, 'pvc'));
    expect(rect.x).toBe(5);
    expect(rect.height).toBeCloseTo(17.2 * 0.5, 2);
  });

  it('falls back to a viewBox rect for a non-cylinder kind', () => {
    const rect = rectAttrs(paintUsageLiquid(ICON_SVG_BY_KIND.pod, 0.5, 'pod'));
    expect(rect.x).toBe(0);
    expect(rect.y).toBeCloseTo(12, 2);
    expect(rect.height).toBeCloseTo(12, 2);
    expect(rect.fill).toBe(usageFillPaint(0.5));
  });
});
