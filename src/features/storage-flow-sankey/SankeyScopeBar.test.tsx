import { fireEvent, render, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { describe, expect, it } from 'vitest';

import { EMPTY_STORAGE_GRAPH_ROOTS } from '../graph-data';

import { SankeyScopeBar } from './SankeyScopeBar';
import { useSankeyQuery } from './useSankeyQuery';

function Harness({
  az = ['local-a', 'zone-b'],
  env = ['demo', 'prod'],
}: {
  az?: string[];
  env?: string[];
}): JSX.Element {
  const controller = useSankeyQuery({ az, env, cluster: ['prod'], namespace: ['prod'] });
  return <SankeyScopeBar options={{ az, env, cluster: ['prod'], namespace: ['prod'] }} controller={controller} />;
}

describe('SankeyScopeBar', () => {
  it('does not preselect when there are several az / env options', () => {
    render(<Harness />);
    expect(screen.getByLabelText<HTMLSelectElement>('AZ').value).toBe('');
    expect(screen.getByLabelText<HTMLSelectElement>('Env').value).toBe('');
  });

  it('auto-selects a lone az / env option', () => {
    render(<Harness az={['local-a']} env={['demo']} />);
    expect(screen.getByLabelText<HTMLSelectElement>('AZ').value).toBe('local-a');
    expect(screen.getByLabelText<HTMLSelectElement>('Env').value).toBe('demo');
  });

  it('falls back to free text when az / env cannot be enumerated', () => {
    // `endpoints.labelValues` is optional independently of `endpoints.storageGraph`, but the
    // endpoint still requires one az and one env — so the control has to stay operable.
    render(<Harness az={[]} env={[]} />);
    const az = screen.getByLabelText<HTMLInputElement>('AZ');
    expect(az.tagName).toBe('INPUT');
    fireEvent.change(az, { target: { value: 'local-a' } });
    fireEvent.change(screen.getByLabelText('Env'), { target: { value: 'demo' } });
    expect(screen.getByLabelText<HTMLInputElement>('AZ').value).toBe('local-a');
    expect(screen.getByLabelText<HTMLInputElement>('Env').value).toBe('demo');
  });

  it('drops the optional cluster / namespace narrowing when there is nothing to enumerate', () => {
    const controllerless = (
      <SankeyScopeBar
        options={{ az: [], env: [], cluster: [], namespace: [] }}
        controller={{
          query: { az: undefined, env: undefined, cluster: [], namespace: [], roots: EMPTY_STORAGE_GRAPH_ROOTS },
          azEnvReady: false,
          podError: undefined,
          setAz: () => {},
          setEnv: () => {},
          setCluster: () => {},
          setNamespace: () => {},
          addRoot: () => true,
          removeRoot: () => {},
          clearRoots: () => {},
        }}
      />
    );
    render(controllerless);
    expect(screen.getByLabelText('AZ')).toBeInTheDocument();
    expect(screen.getByLabelText('Env')).toBeInTheDocument();
    expect(screen.queryByLabelText('Cluster')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Namespace')).not.toBeInTheDocument();
  });

  it('keeps an invalid pod root out of the request and shows an inline error', () => {
    render(<Harness az={['local-a']} env={['demo']} />);
    fireEvent.change(screen.getByLabelText('Root kind'), { target: { value: 'pod' } });
    fireEvent.change(screen.getByLabelText('Root value'), { target: { value: 'orders-0' } });
    fireEvent.submit(screen.getByLabelText('Root value').closest('form')!);
    expect(screen.getByTestId('sankey-pod-error')).toHaveTextContent('<namespace>/<pod>');
    expect(screen.queryByRole('button', { name: /pod:orders-0/ })).not.toBeInTheDocument();
  });

  it('adds a valid root and keeps empty roots legal', () => {
    render(<Harness az={['local-a']} env={['demo']} />);
    fireEvent.change(screen.getByLabelText('Root kind'), { target: { value: 'aggr' } });
    fireEvent.change(screen.getByLabelText('Root value'), { target: { value: 'aggr1' } });
    fireEvent.submit(screen.getByLabelText('Root value').closest('form')!);
    expect(screen.getByRole('button', { name: /aggr:aggr1/ })).toBeInTheDocument();
  });

  it('explains that node matches both sides and mixed roots take the intersection', () => {
    render(<Harness />);
    expect(screen.getByText(/NetApp controllers and Kubernetes nodes/)).toBeInTheDocument();
    expect(screen.getByText(/intersection/)).toBeInTheDocument();
  });
});
