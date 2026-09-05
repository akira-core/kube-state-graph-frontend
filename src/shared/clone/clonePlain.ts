// Plain-JSON deep clone. Covers every value the panel reads from / hands to
// cytoscape element data (normalize emits pure JSON).
//
// Only arrays and PLAIN objects (Object.prototype / null prototype) are recursed.
// Any non-plain object is returned by reference, untouched:
//   - class instances, Dates, functions — never copied;
//   - crucially, the live cytoscape collections the expand-collapse extension
//     parks on element data (`collapsedChildren`, `originalEnds`, …). Those are
//     array-like and reference cy, so they are cyclic — recursing into them blew
//     the stack ("Maximum call stack size exceeded") on every hover.
// A WeakMap of original → clone also guards against reference cycles among plain
// values, so a cyclic structure terminates instead of overflowing. It must map to
// the CLONE, not merely record "seen": returning the original on a repeat visit
// would hand the caller a live pointer back into the source, defeating the whole
// point of the copy (cytoscape/expand-collapse could then write into the memoized
// React-side model through the shared or cyclic reference).
function isPlainObject(value: object): boolean {
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function cloneInner<T>(value: T, seen: WeakMap<object, unknown>): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  const obj = value as unknown as object;
  const cached = seen.get(obj);
  if (cached !== undefined) {
    return cached as T;
  }
  if (Array.isArray(value)) {
    const arr: unknown[] = [];
    seen.set(obj, arr);
    for (const v of value as unknown[]) {
      arr.push(cloneInner(v, seen));
    }
    return arr as T;
  }
  // Non-plain objects (class instances, live cytoscape collections, …) are not
  // JSON and are returned as-is — never recursed.
  if (!isPlainObject(obj)) {
    return value;
  }
  const out: Record<string, unknown> = {};
  seen.set(obj, out);
  for (const [k, v] of Object.entries(value)) {
    // Plain assignment to `__proto__` goes through Object.prototype's setter: the
    // key would be dropped and the clone's prototype replaced instead. JSON.parse
    // creates `__proto__` as a real own property, so backend label/annotation bags
    // can carry one. defineProperty writes it as the own data property it is.
    Object.defineProperty(out, k, {
      value: cloneInner(v, seen),
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
  return out as T;
}

export function clonePlain<T>(value: T): T {
  return cloneInner(value, new WeakMap<object, unknown>());
}
