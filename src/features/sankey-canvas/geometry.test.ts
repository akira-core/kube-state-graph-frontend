import { describe, expect, it } from 'vitest';

import { CARD_LINE_H, cardHeaderH, endChevronPath, HEADER_H } from './geometry';

describe('cardHeaderH', () => {
  it('adds one line step per attribute line to the title and subtitle', () => {
    expect(cardHeaderH(0)).toBe(HEADER_H);
    expect(cardHeaderH(2)).toBe(HEADER_H + 2 * CARD_LINE_H);
  });
});

describe('endChevronPath', () => {
  it('pins a 20 px ribbon at the 7 px half-size cap, tip 2 px inside the target end', () => {
    expect(endChevronPath(100, 50, 20, 1)).toBe('M84,43 L98,50 L84,57');
  });

  it('never draws a 4 px ribbon below the legible 3 px half-size', () => {
    expect(endChevronPath(100, 50, 4, 1)).toBe('M92,47 L98,50 L92,53');
  });

  it('points left when the ribbon enters its target leftward', () => {
    expect(endChevronPath(100, 50, 20, -1)).toBe('M116,43 L102,50 L116,57');
  });
});
