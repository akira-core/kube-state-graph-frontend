import { useState, type JSX, type ReactNode } from 'react';

import { CaretDownIcon, CaretRightIcon } from './icons';
import { eyebrowClass } from './Section';

/** A summary table's header cell; `SUMMARY_TH_NUM` for a numeric column. */
export const SUMMARY_TH = 'px-2 py-1 font-medium';
export const SUMMARY_TH_NUM = 'px-2 py-1 text-right font-medium';
/** A summary table's body row and cells. */
export const SUMMARY_TR = 'border-b border-hairline last:border-b-0';
export const SUMMARY_TD = 'px-2 py-1';
export const SUMMARY_TD_NUM = 'px-2 py-1 text-right font-mono tabular-nums';

export interface SummaryPanelProps {
  /** Prefix for the panel's test-ids: `<testId>` on the panel, `<testId>-toggle` on the header. */
  testId: string;
  title: string;
  /** The counts shown beside the title while folded — the one line that is always visible. */
  meta: ReactNode;
  children: ReactNode;
}

/**
 * The numbers behind a chart, in a panel that opens FOLDED.
 *
 * The open / closed state is page-transient (local, reset on remount) exactly like the
 * chart's own layout controls, so a shared URL never carries it. The tables are tall enough
 * to take half the column, and the chart — the thing the page is for — opened squeezed into
 * what was left. The header strip stays drawn either way: a summary that disappears
 * entirely is indistinguishable from one the estate has no numbers for.
 */
export function SummaryPanel({ testId, title, meta, children }: Readonly<SummaryPanelProps>): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex shrink-0 flex-col border-t border-hairline bg-surface" data-testid={testId}>
      <button
        type="button"
        aria-expanded={open}
        data-testid={`${testId}-toggle`}
        className="flex h-9 shrink-0 items-center gap-2 px-3 text-left transition-colors duration-100 hover:bg-raised-hover"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span aria-hidden className="text-secondary">
          {open ? <CaretDownIcon size={12} /> : <CaretRightIcon size={12} />}
        </span>
        <span className={eyebrowClass}>{title}</span>
        <span className="text-[11px] text-secondary">{meta}</span>
      </button>

      {open && <div className="ksg-scroll max-h-[45vh] min-h-0 space-y-4 overflow-y-auto px-3 pb-3">{children}</div>}
    </div>
  );
}

/** One titled block inside the panel. */
export function SummarySection({ title, children }: Readonly<{ title: string; children: ReactNode }>): JSX.Element {
  return (
    <div>
      <h3 className={eyebrowClass}>{title}</h3>
      {children}
    </div>
  );
}

export interface SummaryTableProps {
  /** Tailwind `min-w-[…]` class for the table, so narrow columns scroll instead of wrapping. */
  minWidthClass: string;
  testId?: string;
  /** The header row's cells. */
  head: ReactNode;
  /** The body rows. */
  children: ReactNode;
}

/** A bordered, horizontally scrollable table with the panel's header-row styling. */
export function SummaryTable({ minWidthClass, testId, head, children }: Readonly<SummaryTableProps>): JSX.Element {
  return (
    <div className="ksg-scroll mt-1.5 overflow-x-auto rounded-md border border-hairline">
      <table className={`w-full ${minWidthClass} text-[11px]`} data-testid={testId}>
        <thead>
          <tr className="border-b border-hairline text-left text-secondary">{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
