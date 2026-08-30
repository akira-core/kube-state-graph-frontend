import type { JSX } from 'react';

export interface EmptyStateProps {
  message?: string;
}

export function EmptyState(props: Readonly<EmptyStateProps>): JSX.Element {
  const { message = 'No graph data' } = props;
  return (
    <div data-testid="empty-state" className="px-4 text-center text-secondary">
      {message}
    </div>
  );
}
