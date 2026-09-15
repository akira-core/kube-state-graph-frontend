import type { JSX } from 'react';

/**
 * The loader's request state as the Sankey views read it — the same four words as
 * `graph-data`'s `GraphStatus`, spelled here once so the stage, the gate and the empty
 * states cannot drift on them.
 */
export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface LoadGateInputs {
  status: LoadStatus;
  hasPayload: boolean;
  error: string | undefined;
}

/**
 * The two screens a Sankey-style view shows INSTEAD of its body: the first load, and a
 * failed first load. Neither applies once a body has been drawn — a refresh that is loading
 * or failed keeps the last drawing on screen, and the nav's lamp carries the state. Called
 * after the view's hooks, never around them.
 */
export function loadGateScreen({ status, hasPayload, error }: LoadGateInputs): JSX.Element | null {
  if (hasPayload) {
    return null;
  }
  if (status === 'loading') {
    return <div className="flex h-full items-center justify-center text-secondary">Loading…</div>;
  }
  if (status === 'error') {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-primary" role="alert">
        {error}
      </div>
    );
  }
  return null;
}
