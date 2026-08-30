import { describe, expect, it } from 'vitest';

import { flattenTokenKeys, tokenPathToCssVar, tokensToCssVars } from './cssVars';
import { LIGHT_TOKENS } from './tokens';

describe('cssVars', () => {
  it('emits a CSS variable name for every token key', () => {
    const keys = flattenTokenKeys(LIGHT_TOKENS);
    const vars = tokensToCssVars(LIGHT_TOKENS);
    const varNames = Object.keys(vars).sort();
    const expected = keys.map(tokenPathToCssVar).sort();
    expect(varNames).toEqual(expected);
    expect(varNames).toContain('--ksg-bg-canvas');
    expect(varNames).toContain('--ksg-sankey-read');
  });
});
