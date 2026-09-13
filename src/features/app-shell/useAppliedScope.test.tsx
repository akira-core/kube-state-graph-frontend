import { fireEvent, render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { BrowserRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ViewTimeRange } from '../../shared/time/viewTimeRange';
import { parseGraphScope, serializeGraphScope } from '../graph-filters/graphUrlScope';

import { useAppliedScope } from './useAppliedScope';

function Probe({ range }: { range: ViewTimeRange }): ReactNode {
  const { applied, commit } = useAppliedScope(parseGraphScope, serializeGraphScope);
  return (
    <div>
      <span data-testid="ns">{applied.namespace.join(',')}</span>
      <button type="button" onClick={() => commit({ ...applied, cluster: ['prod'] }, range)}>
        commit-cluster
      </button>
      <button type="button" onClick={() => commit(applied, range)}>
        commit-applied
      </button>
    </div>
  );
}

describe('useAppliedScope', () => {
  afterEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('writes once per commit and never on mount when from/to are already valid', () => {
    window.history.pushState({}, '', '/graph?namespace=shop&from=now-24h&to=now');
    const replaceState = vi.spyOn(window.history, 'replaceState');
    render(
      <BrowserRouter>
        <Probe range={{ kind: 'relative', window: '1h' }} />
      </BrowserRouter>
    );
    expect(screen.getByTestId('ns')).toHaveTextContent('shop');
    const mounts = replaceState.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'commit-cluster' }));
    expect(replaceState.mock.calls.length).toBe(mounts + 1);
    expect(window.location.search).toContain('cluster=prod');
    expect(window.location.search).toContain('namespace=shop');
    expect(window.location.search).toContain('from=now-1h');
    expect(window.location.search).toContain('to=now');
    replaceState.mockRestore();
  });

  it('drops unknown parameters on commit', () => {
    window.history.pushState({}, '', '/graph?foo=bar&namespace=shop&from=now-24h&to=now');
    render(
      <BrowserRouter>
        <Probe range={{ kind: 'relative', window: '24h' }} />
      </BrowserRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: 'commit-applied' }));
    expect(window.location.search).toContain('namespace=shop');
    expect(window.location.search).not.toContain('foo=');
  });
});
