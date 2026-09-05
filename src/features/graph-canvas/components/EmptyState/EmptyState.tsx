import type { JSX } from 'react';

export interface EmptyStateProps {
  message?: string;
}

export function EmptyState(props: Readonly<EmptyStateProps>): JSX.Element {
  const { message = 'No graph data' } = props;
  return (
    <div
      data-testid="empty-state"
      className="max-w-sm rounded-lg border border-hairline bg-overlay px-5 py-4 text-center text-[13px] leading-relaxed text-secondary shadow-panel backdrop-blur-sm"
    >
      {message}
    </div>
  );
}
