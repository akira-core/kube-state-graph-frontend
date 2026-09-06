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
    expect(screen.getByRole('button', { name: 'AZ' })).toHaveTextContent('All');
    expect(screen.getByRole('button', { name: 'Env' })).toHaveTextContent('All');
  });

  it('auto-selects a lone az / env option', () => {
    render(<Harness az={['local-a']} env={['demo']} />);
    expect(screen.getByRole('button', { name: 'AZ' })).toHaveTextContent('local-a');
    expect(screen.getByRole('button', { name: 'Env' })).toHaveTextContent('demo');
  });

  it('still accepts a typed value when az / env cannot be enumerated', () => {
    render(<Harness az={[]} env={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'AZ' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Search AZ' }), { target: { value: 'zone-a' } });
    fireEvent.click(screen.getByRole('option', { name: 'Use "zone-a"' }));
    fireEvent.click(screen.getByRole('button', { name: 'Env' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Search Env' }), { target: { value: 'prod' } });
    fireEvent.click(screen.getByRole('option', { name: 'Use "prod"' }));
    expect(screen.getByRole('button', { name: 'AZ' })).toHaveTextContent('zone-a');
    expect(screen.getByRole('button', { name: 'Env' })).toHaveTextContent('prod');
    expect(screen.getByRole('button', { name: 'AZ' }).querySelector('[data-unlisted="true"]')).toBeTruthy();
  });

  it('drops the optional cluster / namespace narrowing when there is nothing to enumerate', () => {
    render(
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
    expect(screen.getByRole('button', { name: 'AZ' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Env' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cluster' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Namespace' })).not.toBeInTheDocument();
  });

  it('keeps an invalid pod root out of the request and shows an inline error', () => {
    render(<Harness az={['local-a']} env={['demo']} />);
    fireEvent.click(screen.getByRole('button', { name: 'Root kind' }));
    fireEvent.click(screen.getByRole('option', { name: 'Pod' }));
    fireEvent.change(screen.getByLabelText('Root value'), { target: { value: 'orders-0' } });
    fireEvent.submit(screen.getByLabelText('Root value').closest('form')!);
    expect(screen.getByTestId('sankey-pod-error')).toHaveTextContent('<namespace>/<pod>');
    expect(screen.queryByRole('button', { name: /pod:orders-0/ })).not.toBeInTheDocument();
  });

  it('adds a valid root and keeps empty roots legal', () => {
    render(<Harness az={['local-a']} env={['demo']} />);
    fireEvent.change(screen.getByLabelText('Root value'), { target: { value: 'aggr1' } });
    fireEvent.submit(screen.getByLabelText('Root value').closest('form')!);
    expect(screen.getByRole('button', { name: /aggr:aggr1/ })).toBeInTheDocument();
  });

  it('puts every control in ONE labelled row, with no nested group heading above it', () => {
    render(<Harness />);
    const row = screen.getByRole('button', { name: 'AZ' }).closest('[data-testid="sankey-controls"] > div');
    expect(row).not.toBeNull();
    // AZ, Env, Root kind, the root value input and Add all live in the same flex row, so
    // their labels share one baseline. "Root" used to be a group heading ABOVE "Root kind",
    // which put a second label rank into a row that reads as one and threw the whole bar
    // out of alignment.
    for (const name of ['Env', 'Root kind']) {
      expect(row?.contains(screen.getByRole('button', { name }))).toBe(true);
    }
    expect(row?.contains(screen.getByLabelText('Root value'))).toBe(true);
    expect(row?.contains(screen.getByRole('button', { name: 'Add' }))).toBe(true);
    expect(screen.queryByText('Root', { selector: 'span, label, h3' })).not.toBeInTheDocument();
  });

  it('moves added roots off the control row so a growing pill list cannot reflow it', () => {
    render(<Harness az={['local-a']} env={['demo']} />);
    fireEvent.change(screen.getByLabelText('Root value'), { target: { value: 'aggr1' } });
    fireEvent.submit(screen.getByLabelText('Root value').closest('form')!);
    const pill = screen.getByRole('button', { name: /aggr:aggr1/ });
    const controlRow = screen.getByRole('button', { name: 'AZ' }).closest('[data-testid="sankey-controls"] > div');
    expect(controlRow?.contains(pill)).toBe(false);
  });

  it('explains that node matches both sides and mixed roots take the intersection', () => {
    render(<Harness />);
    expect(screen.getByText(/NetApp controllers and Kubernetes nodes/)).toBeInTheDocument();
    expect(screen.getByText(/intersection/)).toBeInTheDocument();
  });

  it('hints that a Kubernetes node root is visible only under the Node layout', () => {
    render(
      <SankeyScopeBar
        options={{ az: ['a'], env: ['e'], cluster: [], namespace: [] }}
        controller={{
          query: {
            az: 'a',
            env: 'e',
            cluster: [],
            namespace: [],
            roots: { ...EMPTY_STORAGE_GRAPH_ROOTS, node: ['worker-0'] },
          },
          azEnvReady: true,
          podError: undefined,
          setAz: () => {},
          setEnv: () => {},
          setCluster: () => {},
          setNamespace: () => {},
          addRoot: () => true,
          removeRoot: () => {},
          clearRoots: () => {},
        }}
        k8sNodeHint={[{ id: 'node/worker-0', label: 'worker-0' }]}
      />
    );
    expect(screen.getByTestId('sankey-k8s-node-hint')).toHaveTextContent('worker-0');
    expect(screen.getByTestId('sankey-k8s-node-hint')).toHaveTextContent('Node layout');
  });
});
