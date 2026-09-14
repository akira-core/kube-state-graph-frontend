import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { QueryButton, type QueryButtonProps } from './QueryButton';

function renderButton(overrides: Partial<QueryButtonProps> = {}): {
  onQuery: ReturnType<typeof vi.fn>;
  onCancel: ReturnType<typeof vi.fn>;
} {
  const onQuery = vi.fn();
  const onCancel = vi.fn();
  render(
    <QueryButton dirty={false} inFlight={false} disabled={false} onQuery={onQuery} onCancel={onCancel} {...overrides} />
  );
  return { onQuery, onCancel };
}

describe('QueryButton', () => {
  it('renders Query, idle and enabled', () => {
    const { onQuery } = renderButton();
    const button = screen.getByRole('button', { name: 'Query' });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onQuery).toHaveBeenCalledTimes(1);
  });

  it('accents Query while the draft is dirty', () => {
    renderButton({ dirty: true });
    expect(screen.getByTestId('query-button')).toHaveAttribute('data-dirty', 'true');
    expect(screen.getByRole('button', { name: 'Query' })).toBeEnabled();
  });

  it('renders Cancel while a request is in flight', () => {
    const { onQuery, onCancel } = renderButton({ inFlight: true });
    const button = screen.getByRole('button', { name: 'Cancel' });
    expect(button).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Query' })).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onQuery).not.toHaveBeenCalled();
  });

  it('shows the disabled reason beside Query and does not fire', () => {
    const { onQuery } = renderButton({ disabled: true, disabledReason: 'At least one root is required' });
    expect(screen.getByRole('button', { name: 'Query' })).toBeDisabled();
    expect(screen.getByTestId('query-disabled-reason')).toHaveTextContent('At least one root is required');
    fireEvent.click(screen.getByRole('button', { name: 'Query' }));
    expect(onQuery).not.toHaveBeenCalled();
  });

  it('keeps Cancel clickable while disabled-by-scope would otherwise apply', () => {
    const { onCancel } = renderButton({
      inFlight: true,
      disabled: true,
      disabledReason: 'At least one root is required',
    });
    const button = screen.getByRole('button', { name: 'Cancel' });
    expect(button).toBeEnabled();
    expect(screen.queryByTestId('query-disabled-reason')).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('is an action, not a labelled field: no label above the button', () => {
    renderButton();
    // The first cut put a QUERY label over an outlined button, and it read as one more
    // dropdown in the row. The only "Query" text now is the button's own.
    expect(screen.getAllByText('Query')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Query' })).toHaveTextContent('Query');
  });

  it('says in words that the draft is not applied while it is dirty', () => {
    renderButton({ dirty: true });
    expect(screen.getByTestId('query-pending')).toHaveTextContent('Changes not applied');
  });

  it('drops the pending words when clean, in flight, or unavailable', () => {
    const noop = (): void => undefined;
    const { rerender } = render(
      <QueryButton dirty={false} inFlight={false} disabled={false} onQuery={noop} onCancel={noop} />
    );
    expect(screen.queryByTestId('query-pending')).not.toBeInTheDocument();
    rerender(<QueryButton dirty inFlight disabled={false} onQuery={noop} onCancel={noop} />);
    expect(screen.queryByTestId('query-pending')).not.toBeInTheDocument();
    // An unsendable draft says why instead: the reason is the more useful sentence.
    rerender(
      <QueryButton
        dirty
        inFlight={false}
        disabled
        disabledReason="At least one root is required"
        onQuery={noop}
        onCancel={noop}
      />
    );
    expect(screen.queryByTestId('query-pending')).not.toBeInTheDocument();
    expect(screen.getByTestId('query-disabled-reason')).toHaveTextContent('At least one root is required');
  });
});
