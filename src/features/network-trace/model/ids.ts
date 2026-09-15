// Ids of the cards the trace synthesises. One place, so the wire-id guard in `validate`
// and the builders in `edges` / `investigation` can never disagree on the spelling.

export const ANCHOR_ID = 'trace:anchor';
export const NS_ID_PREFIX = 'trace:ns:';
export const APP_ID_PREFIX = 'trace:app:';
export const OWNER_ID_PREFIX = 'trace:owner:';

const SEQ_PREFIXES: readonly string[] = [NS_ID_PREFIX, APP_ID_PREFIX, OWNER_ID_PREFIX];

/** True for an id the derive pipeline would mint itself (`trace:ns:3`, the anchor, …). */
export function isSyntheticId(id: string): boolean {
  if (id === ANCHOR_ID) {
    return true;
  }
  return SEQ_PREFIXES.some((p) => id.startsWith(p) && /^\d+$/.test(id.slice(p.length)));
}
