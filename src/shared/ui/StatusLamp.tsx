import { clsx } from 'clsx';
import type { JSX } from 'react';

export type LampState = 'live' | 'refreshing' | 'error' | 'idle';

const COLOR_VAR: Record<LampState, string> = {
  live: 'var(--ksg-status-normal)',
  refreshing: 'var(--ksg-status-warning)',
  error: 'var(--ksg-status-critical)',
  idle: 'var(--ksg-fg-muted)',
};

/**
 * The freshness lamp.
 *
 * The question this console gets asked before any other is "am I looking at now?".
 * A lit dot answers it from across a room, in the one place a rack instrument would put
 * it, and it is the only element in the chrome allowed to move.
 */
export function StatusLamp({ state, className }: Readonly<{ state: LampState; className?: string }>): JSX.Element {
  const color = COLOR_VAR[state];
  return (
    <span
      className={clsx('relative inline-flex h-2 w-2 shrink-0', className)}
      aria-hidden
      data-testid="status-lamp"
      data-state={state}
    >
      <span
        className={clsx('absolute inset-0 rounded-full', state === 'refreshing' && 'ksg-lamp-pulse')}
        style={{ backgroundColor: color, boxShadow: `0 0 0 3px color-mix(in srgb, ${color} 22%, transparent)` }}
      />
    </span>
  );
}
