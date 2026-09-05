import { clonePlain } from './clonePlain';

describe('clonePlain', () => {
  it('deep-clones nested objects and arrays', () => {
    const original = { a: 1, nested: { b: [1, 2, { c: 'x' }] } };
    const cloned = clonePlain(original);
    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
    expect(cloned.nested).not.toBe(original.nested);
    expect(cloned.nested.b).not.toBe(original.nested.b);
    expect(cloned.nested.b[2]).not.toBe(original.nested.b[2]);
  });

  it('passes primitives (including falsy ones) through unchanged', () => {
    expect(clonePlain(0)).toBe(0);
    expect(clonePlain('')).toBe('');
    expect(clonePlain(null)).toBeNull();
    expect(clonePlain(undefined)).toBeUndefined();
    expect(clonePlain(false)).toBe(false);
  });

  it('returns non-plain class instances by reference instead of recursing into them', () => {
    // The util's contract: only arrays / plain objects are deep-copied; anything
    // with a non-Object prototype (class instances, and notably the live cytoscape
    // collections the expand-collapse extension parks on element data) is passed
    // through untouched.
    class Box {
      constructor(public readonly v: number) {}
    }
    const box = new Box(1);
    const cloned = clonePlain({ box });
    expect(cloned).not.toBe({ box }); // top level is a fresh object
    expect(cloned.box).toBe(box); // the instance itself is not copied
  });

  it('does not overflow the stack on a self-referential (cyclic) structure', () => {
    // Reproduces the hover crash: cytoscape parks live, cyclic collections on
    // element data, and the old clone recursed forever ("Maximum call stack size
    // exceeded"). A cycle must terminate, not blow the stack.
    const a: Record<string, unknown> = { name: 'a' };
    a.self = a;
    expect(() => clonePlain(a)).not.toThrow();
    expect((clonePlain(a) as { name: string }).name).toBe('a');
  });
});
