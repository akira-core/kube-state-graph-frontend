import type { JSX } from 'react';

import { Button } from './Button';

export interface QueryButtonProps {
  dirty: boolean;
  inFlight: boolean;
  disabled: boolean;
  disabledReason?: string;
  onQuery: () => void;
  onCancel: () => void;
}

/**
 * The commit / abort control for a page's draft.
 *
 * Query is the labelled last column of a filter / scope row. While a request is in
 * flight it becomes Cancel — disabling-by-scope must not trap an in-flight request
 * behind a greyed-out button.
 */
export function QueryButton({
  dirty,
  inFlight,
  disabled,
  disabledReason,
  onQuery,
  onCancel,
}: Readonly<QueryButtonProps>): JSX.Element {
  const label = inFlight ? 'Cancel' : 'Query';
  const queryDisabled = disabled && !inFlight;
  return (
    <div className="flex items-end gap-2">
      <div className="flex min-w-[5.5rem] flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-eyebrow text-secondary">{label}</span>
        <Button
          size="md"
          variant={!inFlight && dirty ? 'primary' : 'outline'}
          aria-label={label}
          disabled={queryDisabled}
          data-testid="query-button"
          data-dirty={dirty ? 'true' : undefined}
          onClick={inFlight ? onCancel : onQuery}
        >
          {label}
        </Button>
      </div>
      {queryDisabled && disabledReason !== undefined && disabledReason !== '' && (
        <span
          className="mb-1.5 max-w-[16rem] text-[11px] leading-snug text-secondary"
          data-testid="query-disabled-reason"
        >
          {disabledReason}
        </span>
      )}
    </div>
  );
}
