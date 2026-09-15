import type { LoadStatus } from './loadGate';

/**
 * The four empty states every Sankey page shares, decided in one place so the two views
 * cannot drift on the one rule that matters: a failed or unsent request and an empty but
 * successful one must never be the same blank screen, and editing the draft must never
 * hide what was drawn.
 */
export type ShellEmptyKind = 'unconfigured' | 'scope' | 'awaiting' | 'cancelled';

export interface ShellEmptyInputs {
  demoMode: boolean;
  /** The page's endpoint is present in the runtime config. */
  endpointConfigured: boolean;
  /** The DRAFT can be queried. Only consulted while nothing has been drawn. */
  scopeReady: boolean;
  status: LoadStatus;
  hasPayload: boolean;
  cancelled: boolean;
}

/**
 * Shell-level cause of an empty chart, or `null` when the body decides. Demo mode has none
 * of these: the fixture is always drawn.
 *
 * `scope` is gated on `!hasPayload` on purpose. The scope bar edits a draft; the drawn body
 * is the APPLIED selection, and the explicit-query spec says editing a draft input must not
 * alter the drawn data. Unchecking the last root after a successful Query therefore keeps
 * the chart (with "Changes not applied" beside the Query button) instead of replacing it
 * with a message claiming no request was sent.
 */
export function shellEmptyKind({
  demoMode,
  endpointConfigured,
  scopeReady,
  status,
  hasPayload,
  cancelled,
}: ShellEmptyInputs): ShellEmptyKind | null {
  if (demoMode) {
    return null;
  }
  if (!endpointConfigured) {
    return 'unconfigured';
  }
  if (!scopeReady && !hasPayload) {
    return 'scope';
  }
  if (status === 'idle' && !hasPayload && !cancelled) {
    return 'awaiting';
  }
  if (cancelled && !hasPayload) {
    return 'cancelled';
  }
  return null;
}
