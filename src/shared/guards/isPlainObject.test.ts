import { isPlainObject } from './isPlainObject';

describe('isPlainObject', () => {
  it('accepts non-null plain objects', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ a: 1 })).toBe(true);
  });

  it('rejects null, arrays, and primitives', () => {
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject([1, 2])).toBe(false);
    expect(isPlainObject('x')).toBe(false);
    expect(isPlainObject(3)).toBe(false);
    expect(isPlainObject(undefined)).toBe(false);
  });
});
