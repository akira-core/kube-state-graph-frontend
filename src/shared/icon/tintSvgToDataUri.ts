// Pure helper: turn a single-colour line-art SVG (using the `currentColor`
// sentinel for its stroke/fill) into a tinted, inline `data:image/svg+xml` URI
// suitable for a cytoscape node `background-image`.
//
// Encoding follows the cytoscape.js style docs verbatim:
//   "Use encodeURIComponent on SVG data URIs ... Do not use base 64 encoding for
//    SVG within a data URI."
// (The SVG must also carry an XML header — see iconSvgByKind.ts — or cytoscape
// rasterises nothing on the canvas even though an <img> would still show it.)
//
// `currentColor` does NOT penetrate an SVG referenced via `background-image`
// (cytoscape rasterises it), so the colour is injected into the source here,
// before encoding — once per (svg, colour) pair.

// Memoized by `${color}\n${rawSvg}`. The raw SVG is a stable per-kind constant,
// so the real cardinality is (kinds × themes) — tiny. Memoizing also keeps the
// returned string referentially stable, which preserves cytoscape's by-URL image
// cache (a fresh URI per node would defeat it).
const cache = new Map<string, string>();

export function tintSvgToDataUri(rawSvg: string, color: string): string {
  const key = `${color}\n${rawSvg}`;
  const cached = cache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const tinted = rawSvg.split('currentColor').join(color);
  const uri = `data:image/svg+xml,${encodeURIComponent(tinted)}`;
  cache.set(key, uri);
  return uri;
}
