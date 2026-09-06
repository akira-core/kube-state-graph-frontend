import { fireEvent, render, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { describe, expect, it } from 'vitest';

import { EMPTY_STORAGE_GRAPH_ROOTS } from '../graph-data';

import type { SankeyRootOptions } from './deriveSankey';
import { SankeyScopeBar } from './SankeyScopeBar';
import { useSankeyQuery } from './useSankeyQuery';

function Harness({
  az = ['local-a', 'zone-b'],
  env = ['demo', 'prod'],
  rootOptions,
}: {
  az?: string[];
  env?: string[];
  rootOptions?: SankeyRootOptions;
}): JSX.Element {
  const controller = useSankeyQuery({ az, env, cluster: ['prod'], namespace: ['prod'] });
  return (
    <SankeyScopeBar
      options={{ az, env, cluster: ['prod'], namespace: ['prod'] }}
      controller={controller}
      {...(rootOptions !== undefined ? { rootOptions } : {})}
    />
  );
}

/** Type a value the offered list does not contain and take the custom row. */
function typeRootValue(text: string): void {
  fireEvent.click(screen.getByRole('button', { name: 'Root value' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Search Root value' }), { target: { value: text } });
  fireEvent.click(screen.getByRole('option', { name: `Use "${text}"` }));
}

function submitRoot(): void {
  fireEvent.submit(screen.getByRole('button', { name: 'Root value' }).closest('form')!);
}

const EMPTY_ROOT_OPTIONS: SankeyRootOptions = { ontap_cluster: [], node: [], aggr: [], svm: [], pod: [] };

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
    typeRootValue('orders-0');
    submitRoot();
    expect(screen.getByTestId('sankey-pod-error')).toHaveTextContent('<namespace>/<pod>');
    expect(screen.queryByRole('button', { name: /pod:orders-0/ })).not.toBeInTheDocument();
  });

  it('adds a valid root and keeps empty roots legal', () => {
    render(<Harness az={['local-a']} env={['demo']} />);
    typeRootValue('aggr1');
    submitRoot();
    expect(screen.getByRole('button', { name: /aggr:aggr1/ })).toBeInTheDocument();
  });

  it('offers the drawn body\u2019s root values for the selected kind, and only that kind\u2019s', () => {
    const rootOptions: SankeyRootOptions = {
      ontap_cluster: ['ontap-lab'],
      node: ['ontap-lab-01', 'worker-0'],
      aggr: ['aggr1', 'aggr2'],
      svm: ['svm_demo'],
      pod: ['shop/mongodb-0'],
    };
    render(<Harness az={['local-a']} env={['demo']} rootOptions={rootOptions} />);

    fireEvent.click(screen.getByRole('button', { name: 'Root value' }));
    expect(screen.getByRole('option', { name: 'aggr1' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'aggr2' })).toBeInTheDocument();
    // A value belonging to another kind must not be offered here: committed under `aggr`
    // it is a silently empty graph, not an error.
    expect(screen.queryByRole('option', { name: 'svm_demo' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: 'aggr2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('button', { name: /aggr:aggr2/ })).toBeInTheDocument();

    // Switching kind re-lists, and drops the pending value with it.
    fireEvent.click(screen.getByRole('button', { name: 'Root kind' }));
    fireEvent.click(screen.getByRole('option', { name: 'SVM' }));
    expect(screen.getByRole('button', { name: 'Root value' })).toHaveTextContent('Select or type');
    fireEvent.click(screen.getByRole('button', { name: 'Root value' }));
    expect(screen.getByRole('option', { name: 'svm_demo' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'aggr1' })).not.toBeInTheDocument();
  });

  it('still takes a typed value that the drawn body does not offer', () => {
    // The body is a projection, so its names are not the authority on what exists — a root
    // the operator knows about must stay reachable even when the current result omits it.
    render(<Harness az={['local-a']} env={['demo']} rootOptions={{ ...EMPTY_ROOT_OPTIONS, aggr: ['aggr1'] }} />);
    typeRootValue('aggr9');
    submitRoot();
    expect(screen.getByRole('button', { name: /aggr:aggr9/ })).toBeInTheDocument();
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
    expect(row?.contains(screen.getByRole('button', { name: 'Root value' }))).toBe(true);
    expect(row?.contains(screen.getByRole('button', { name: 'Add' }))).toBe(true);
    expect(screen.queryByText('Root', { selector: 'span, label, h3' })).not.toBeInTheDocument();
  });

  it('moves added roots off the control row so a growing pill list cannot reflow it', () => {
    render(<Harness az={['local-a']} env={['demo']} />);
    typeRootValue('aggr1');
    submitRoot();
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
