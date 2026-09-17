import type { JSX, ReactNode } from 'react';

/** The small label over a control in a scope bar row. */
export const controlLabelClass = 'text-[10px] font-semibold uppercase tracking-eyebrow text-secondary';

/**
 * One label-over-control column of a scope bar row. The row aligns its columns on their
 * bottom edge, so a control of any height sits on the same baseline as its neighbours.
 */
export function ControlField({ label, children }: Readonly<{ label: string; children: ReactNode }>): JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <span className={controlLabelClass}>{label}</span>
      {children}
    </div>
  );
}

/**
 * A scope bar's trailing group, after its Query action: separated by a hairline and pushed
 * to the row's end while the row has room, wrapped onto the next line inside the same bar
 * when it does not.
 */
export function TrailingControls({ children }: Readonly<{ children: ReactNode }>): JSX.Element {
  return (
    <div className="ml-auto flex flex-wrap items-end gap-x-3 gap-y-2 border-l border-hairline pl-3">{children}</div>
  );
}
