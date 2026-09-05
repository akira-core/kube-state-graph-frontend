import type { JSX } from 'react';

import { ExternalLinkIcon, SpinnerIcon } from '../../../../shared/ui/icons';

import type { ChangeReportCellProps } from './ChangeReportCell.types';

export function ChangeReportCell({ state, idPrefix }: Readonly<ChangeReportCellProps>): JSX.Element {
  return (
    <div className="flex items-center justify-end gap-2">
      {state.status === 'loading' && (
        <span className="inline-flex items-center gap-1 text-sm text-secondary" data-testid={`${idPrefix}-url-pending`}>
          <SpinnerIcon size={12} /> Looking up…
        </span>
      )}
      {state.status === 'ready' && (
        <a
          className="inline-flex items-center gap-1 text-link hover:underline"
          href={state.url}
          target="_blank"
          rel="noopener noreferrer"
          data-testid={`${idPrefix}-url-link`}
        >
          <ExternalLinkIcon size={12} /> URL
        </a>
      )}
      {state.status === 'unavailable' && (
        <span
          className="max-w-[40ch] overflow-hidden text-ellipsis whitespace-nowrap text-sm text-secondary"
          data-testid={`${idPrefix}-url-unavailable`}
          {...(state.error !== undefined ? { title: state.error } : {})}
        >
          {state.error ?? 'Not found'}
        </span>
      )}
    </div>
  );
}
