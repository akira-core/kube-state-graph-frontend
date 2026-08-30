import { describe, expect, it } from 'vitest';

import { flattenTokenKeys } from './cssVars';
import { DARK_TOKENS, LIGHT_TOKENS } from './tokens';

describe('theme tokens', () => {
  it('gives light and dark the same key set with no missing keys', () => {
    const lightKeys = flattenTokenKeys(LIGHT_TOKENS).sort();
    const darkKeys = flattenTokenKeys(DARK_TOKENS).sort();
    expect(lightKeys).toEqual(darkKeys);
    expect(lightKeys.length).toBeGreaterThan(0);
  });
});
