import { serializeTimeQuery, type ViewTimeRange } from '../time/viewTimeRange';

/**
 * Rebuild a query string in canonical order: page-owned pairs, then `from`/`to`.
 * Unknown keys never make it back in.
 */
export function buildSearchString(owned: ReadonlyArray<readonly [string, string]>, range: ViewTimeRange): string {
  const params = new URLSearchParams();
  for (const [key, value] of owned) {
    params.append(key, value);
  }
  const time = serializeTimeQuery(range);
  params.append('from', time.from);
  params.append('to', time.to);
  return params.toString();
}
