import { MISSING_VALUE_PLACEHOLDER } from './missingValuePlaceholder';

describe('MISSING_VALUE_PLACEHOLDER', () => {
  it('is the single-source "n/a" string for absent table-cell values', () => {
    expect(MISSING_VALUE_PLACEHOLDER).toBe('n/a');
  });
});
