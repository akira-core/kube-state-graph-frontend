import { clsx } from 'clsx';
import type { JSX, ReactNode } from 'react';

/**
 * One typographic rank for every group label in the rail and the detail panel.
 *
 * The rail stacks eight or nine unrelated groups; giving each its own heading size is
 * what made the old rail read as a document rather than an instrument. A single
 * small-caps eyebrow puts all of them on the same rank, and the content below each one
 * carries the contrast instead.
 */
export const eyebrowClass = 'text-[10px] font-semibold uppercase leading-4 tracking-eyebrow text-muted';

/** Sub-rank inside a group (the category rows within Node Kinds). */
export const subEyebrowClass = 'text-[9px] font-semibold uppercase leading-4 tracking-eyebrow text-muted opacity-80';

export interface RailGroupProps {
  title: string;
  /** Right-aligned control on the header row (collapse-all, fold caret, …). */
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  'data-testid'?: string;
}

/** A titled block in the left rail, separated from its neighbours by a hairline. */
export function RailGroup({
  title,
  action,
  children,
  className,
  'data-testid': testId,
}: Readonly<RailGroupProps>): JSX.Element {
  return (
    <section
      className={clsx('border-t border-hairline px-3 py-1.5 first:border-t-0', className)}
      {...(testId !== undefined ? { 'data-testid': testId } : {})}
    >
      <div className="mb-0.5 flex min-h-[20px] items-center justify-between gap-2">
        <h4 className={eyebrowClass}>{title}</h4>
        {action}
      </div>
      {children}
    </section>
  );
}
