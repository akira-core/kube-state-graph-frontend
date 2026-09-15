import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TraceScopeBar, type TraceScopeBarProps } from './TraceScopeBar';
import { EMPTY_TRACE_DRAFT, MSG_HOSTNAME_REQUIRED, MSG_MAX_HOPS, MSG_THRESHOLD } from './traceUrlScope';

function renderBar(overrides: Partial<TraceScopeBarProps> = {}): {
  onDraftChange: ReturnType<typeof vi.fn>;
  onQuery: ReturnType<typeof vi.fn>;
  onCancel: ReturnType<typeof vi.fn>;
  unmount: () => void;
} {
  const onDraftChange = vi.fn();
  const onQuery = vi.fn();
  const onCancel = vi.fn();
  const { unmount } = render(
    <TraceScopeBar
      draft={EMPTY_TRACE_DRAFT}
      onDraftChange={onDraftChange}
      hostnameOptions={[]}
      problems={[]}
      onQuery={onQuery}
      onCancel={onCancel}
      {...overrides}
    />
  );
  return { onDraftChange, onQuery, onCancel, unmount };
}

describe('TraceScopeBar', () => {
  it('lists the drawn switches as hostname candidates and reports the pick', () => {
    const { onDraftChange } = renderBar({ hostnameOptions: ['dist-a', 'spine-a'] });
    expect(screen.getByTestId('trace-hostname')).toHaveTextContent('Pick a switch');
    fireEvent.click(screen.getByTestId('trace-hostname'));
    expect(screen.getByRole('option', { name: 'dist-a' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'spine-a' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: 'spine-a' }));
    expect(onDraftChange).toHaveBeenCalledWith({ hostname: 'spine-a' });
  });

  it('takes a typed hostname the list does not offer, and explains an empty list', () => {
    const { onDraftChange } = renderBar();
    fireEvent.click(screen.getByTestId('trace-hostname'));
    expect(screen.getByTestId('trace-hostname-empty-hint')).toHaveTextContent('typed until a query has drawn them');
    fireEvent.change(screen.getByRole('combobox', { name: 'Search Hostname' }), { target: { value: 'sw-tor-1' } });
    fireEvent.click(screen.getByRole('option', { name: 'Use "sw-tor-1"' }));
    expect(onDraftChange).toHaveBeenCalledWith({ hostname: 'sw-tor-1' });
  });

  it('shows the applied hostname on the trigger, marked unlisted when the body did not draw it', () => {
    renderBar({ draft: { ...EMPTY_TRACE_DRAFT, hostname: 'sw-tor-1' }, hostnameOptions: ['dist-a'] });
    expect(screen.getByTestId('trace-hostname')).toHaveTextContent('sw-tor-1');
    expect(screen.getByTestId('trace-hostname').querySelector('[data-unlisted="true"]')).toBeTruthy();
  });

  it('passes the number fields through as the raw strings typed', () => {
    const { onDraftChange } = renderBar();
    expect(screen.getByTestId('trace-max-hops')).toHaveAttribute('placeholder', '7');
    expect(screen.getByTestId('trace-top-n')).toHaveAttribute('placeholder', '3');
    expect(screen.getByTestId('trace-threshold')).toHaveAttribute('placeholder', '10');
    fireEvent.change(screen.getByTestId('trace-max-hops'), { target: { value: '5' } });
    expect(onDraftChange).toHaveBeenLastCalledWith({ maxHops: '5' });
    fireEvent.change(screen.getByTestId('trace-top-n'), { target: { value: '-1' } });
    expect(onDraftChange).toHaveBeenLastCalledWith({ topN: '-1' });
    fireEvent.change(screen.getByTestId('trace-threshold'), { target: { value: '12.5' } });
    expect(onDraftChange).toHaveBeenLastCalledWith({ threshold: '12.5' });
    expect(onDraftChange).toHaveBeenCalledTimes(3);
  });

  it('reports a cleared field as the empty string, which means the default', () => {
    const { onDraftChange } = renderBar({ draft: { ...EMPTY_TRACE_DRAFT, threshold: '12.5' } });
    fireEvent.change(screen.getByTestId('trace-threshold'), { target: { value: '' } });
    expect(onDraftChange).toHaveBeenLastCalledWith({ threshold: '' });
  });

  it('shows the draft values verbatim in the fields, an unusable one included', () => {
    // A link carrying `max_hops=abc` must show `abc` beside its message; a number input
    // would blank it and leave the operator reading about a value they cannot see.
    renderBar({ draft: { ...EMPTY_TRACE_DRAFT, maxHops: 'abc', topN: '2', threshold: '0.5' } });
    expect(screen.getByTestId('trace-max-hops')).toHaveValue('abc');
    expect(screen.getByTestId('trace-top-n')).toHaveValue('2');
    expect(screen.getByTestId('trace-threshold')).toHaveValue('0.5');
  });

  it('reports the track direction as the closed enum', () => {
    const { onDraftChange } = renderBar();
    const select = screen.getByTestId('trace-track-dir');
    expect(select).toHaveValue('source');
    fireEvent.change(select, { target: { value: 'destination' } });
    expect(onDraftChange).toHaveBeenLastCalledWith({ trackDir: 'destination' });
    fireEvent.change(select, { target: { value: 'source' } });
    expect(onDraftChange).toHaveBeenLastCalledWith({ trackDir: 'source' });
  });

  it('disables Query with the first problem and lists the rest beneath', () => {
    const { onQuery } = renderBar({ problems: [MSG_HOSTNAME_REQUIRED, MSG_MAX_HOPS, MSG_THRESHOLD] });
    const query = screen.getByRole('button', { name: 'Query' });
    expect(query).toBeDisabled();
    expect(screen.getByTestId('query-disabled-reason')).toHaveTextContent(MSG_HOSTNAME_REQUIRED);
    const extra = screen.getAllByTestId('trace-scope-problem');
    expect(extra.map((el) => el.textContent)).toEqual([MSG_MAX_HOPS, MSG_THRESHOLD]);
    fireEvent.click(query);
    expect(onQuery).not.toHaveBeenCalled();
  });

  it('shows no problem row for a single problem and none at all for a clean draft', () => {
    const { unmount } = renderBar({ problems: [MSG_MAX_HOPS] });
    expect(screen.getByTestId('query-disabled-reason')).toHaveTextContent(MSG_MAX_HOPS);
    expect(screen.queryByTestId('trace-scope-problem')).not.toBeInTheDocument();
    unmount();
    renderBar();
    expect(screen.queryByTestId('query-disabled-reason')).not.toBeInTheDocument();
    expect(screen.queryByTestId('trace-scope-problem')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Query' })).toBeEnabled();
  });

  it('fires Query when enabled and marks a dirty draft as not applied', () => {
    const { onQuery } = renderBar({ dirty: true });
    expect(screen.getByTestId('query-pending')).toHaveTextContent('Changes not applied');
    fireEvent.click(screen.getByRole('button', { name: 'Query' }));
    expect(onQuery).toHaveBeenCalledTimes(1);
  });

  it('turns into Cancel while a request is in flight, even with problems', () => {
    const { onCancel, onQuery } = renderBar({ inFlight: true, problems: [MSG_HOSTNAME_REQUIRED] });
    expect(screen.queryByRole('button', { name: 'Query' })).not.toBeInTheDocument();
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(cancel).toBeEnabled();
    fireEvent.click(cancel);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onQuery).not.toHaveBeenCalled();
  });

  it('omits the Query action entirely when hidden (demo mode)', () => {
    renderBar({ hideQuery: true, problems: [MSG_HOSTNAME_REQUIRED] });
    expect(screen.queryByRole('button', { name: 'Query' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('query-disabled-reason')).not.toBeInTheDocument();
    expect(screen.getByTestId('trace-hostname')).toBeInTheDocument();
  });

  it('editing a field issues no request and calls nothing but onDraftChange', () => {
    const { onQuery, onCancel } = renderBar();
    fireEvent.change(screen.getByTestId('trace-max-hops'), { target: { value: '9' } });
    fireEvent.change(screen.getByTestId('trace-track-dir'), { target: { value: 'destination' } });
    expect(onQuery).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });
});
