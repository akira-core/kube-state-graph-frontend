import type { JSX } from 'react';

import { Button } from './Button';
import { PlayIcon, SpinnerIcon } from './icons';

export interface QueryButtonProps {
  dirty: boolean;
  inFlight: boolean;
  disabled: boolean;
  disabledReason?: string;
  onQuery: () => void;
  onCancel: () => void;
}

type QueryVariant = 'solid' | 'primary' | 'outline';

function variantFor(inFlight: boolean, dirty: boolean): QueryVariant {
  if (inFlight) {
    return 'outline';
  }
  return dirty ? 'primary' : 'solid';
}

/**
 * The commit / abort control for a page's draft.
 *
 * It closes its filter / scope row as an action, not as one more field: no label above it,
 * a filled button after a divider. The first cut, an outlined and labelled last column, read
 * as another dropdown beside the bordered ones. It stays hue-free `solid` while there is
 * nothing new to apply and takes the accent while the draft differs from what is drawn, with
 * the words beside it. While a request is in flight it becomes Cancel — disabling-by-scope
 * must not trap an in-flight request behind a greyed-out button.
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
  const showReason = queryDisabled && disabledReason !== undefined && disabledReason !== '';
  const showPending = dirty && !inFlight && !queryDisabled;
  return (
    <div className="ml-auto flex h-8 items-center gap-2.5 border-l border-hairline pl-3">
      {showReason && (
        <span className="max-w-[16rem] text-[11px] leading-snug text-secondary" data-testid="query-disabled-reason">
          {disabledReason}
        </span>
      )}
      {showPending && (
        <span className="text-[11px] text-secondary" data-testid="query-pending">
          Changes not applied
        </span>
      )}
      <Button
        size="md"
        variant={variantFor(inFlight, dirty)}
        className="h-8 px-3"
        aria-label={label}
        disabled={queryDisabled}
        data-testid="query-button"
        data-dirty={dirty ? 'true' : undefined}
        onClick={inFlight ? onCancel : onQuery}
      >
        {inFlight ? <SpinnerIcon size={12} /> : <PlayIcon size={12} />}
        {label}
      </Button>
    </div>
  );
}
