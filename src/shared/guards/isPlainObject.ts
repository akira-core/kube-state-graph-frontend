// Narrow `unknown` to a non-null, non-array object. Shared cross-feature primitive:
// the graph-data normalize boundary and the node-detail response parsers all gate
// untyped JSON on this exact shape, so it lives in `shared/` rather than being
// re-declared per feature.
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
