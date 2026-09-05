import { useState, type JSX } from 'react';

import type { StorageGraphRoots } from '../graph-data';

import type { SankeyIdentityOptions, SankeyQueryController, SankeyRootKind } from './useSankeyQuery';

export interface SankeyScopeBarProps {
  options: SankeyIdentityOptions;
  controller: SankeyQueryController;
}

const ROOT_KINDS: ReadonlyArray<{ kind: SankeyRootKind; label: string }> = [
  { kind: 'ontap_cluster', label: 'ONTAP cluster' },
  { kind: 'node', label: 'Node' },
  { kind: 'aggr', label: 'Aggregate' },
  { kind: 'svm', label: 'SVM' },
  { kind: 'pod', label: 'Pod' },
];

function selectedValues(select: HTMLSelectElement): string[] {
  return Array.from(select.selectedOptions, (option) => option.value);
}

function MultiSelect({
  label,
  values,
  available,
  onChange,
}: Readonly<{
  label: string;
  values: string[];
  available: string[];
  onChange: (values: string[]) => void;
}>): JSX.Element {
  const shown = [...new Set([...available, ...values])];
  return (
    <label className="flex flex-col text-xs text-secondary">
      <span>
        {label}
        {values.length > 0 ? ` (${values.length})` : ''}
      </span>
      <select
        multiple
        aria-label={label}
        className="mt-0.5 h-16 min-w-28 rounded border border-medium bg-canvas px-1 py-0.5 text-primary"
        value={values}
        onChange={(e) => onChange(selectedValues(e.currentTarget))}
      >
        {shown.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * `az` / `env`. Both are REQUIRED by the storage-graph endpoint, so this control has to stay
 * operable even when nothing can be enumerated — `endpoints.labelValues` is independently
 * optional from `endpoints.storageGraph`, and a dropdown with no options would leave the
 * empty state telling the operator to pick an az and env next to a control that cannot pick
 * one. With options it is a select; without them it falls back to free text, which is what
 * the backend matches on anyway.
 */
function SingleSelect({
  label,
  value,
  available,
  onChange,
}: Readonly<{
  label: string;
  value: string | undefined;
  available: string[];
  onChange: (value: string | undefined) => void;
}>): JSX.Element {
  const testId = `sankey-${label.toLowerCase()}`;
  const commit = (raw: string): void => onChange(raw.trim() === '' ? undefined : raw.trim());
  if (available.length === 0) {
    return (
      <label className="flex flex-col text-xs text-secondary">
        <span>{label}</span>
        <input
          aria-label={label}
          data-testid={testId}
          placeholder="Type a value"
          className="mt-0.5 min-w-28 rounded border border-medium bg-canvas px-1 py-1 text-primary"
          value={value ?? ''}
          onChange={(e) => commit(e.currentTarget.value)}
        />
      </label>
    );
  }
  const shown = value !== undefined && !available.includes(value) ? [value, ...available] : available;
  return (
    <label className="flex flex-col text-xs text-secondary">
      <span>{label}</span>
      <select
        aria-label={label}
        data-testid={testId}
        className="mt-0.5 min-w-28 rounded border border-medium bg-canvas px-1 py-1 text-primary"
        value={value ?? ''}
        onChange={(e) => commit(e.currentTarget.value)}
      >
        <option value="">Select…</option>
        {shown.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </label>
  );
}

function rootEntries(roots: StorageGraphRoots): Array<{ kind: SankeyRootKind; value: string }> {
  const out: Array<{ kind: SankeyRootKind; value: string }> = [];
  for (const { kind } of ROOT_KINDS) {
    for (const value of roots[kind]) {
      out.push({ kind, value });
    }
  }
  return out;
}

export function SankeyScopeBar({ options, controller }: Readonly<SankeyScopeBarProps>): JSX.Element {
  const [rootKind, setRootKind] = useState<SankeyRootKind>('aggr');
  const [rootValue, setRootValue] = useState('');
  return (
    <div
      aria-label="Sankey scope"
      data-testid="sankey-controls"
      className="flex shrink-0 flex-wrap items-end gap-3 border-b border-weak bg-surface px-3 py-2"
    >
      <SingleSelect label="AZ" value={controller.query.az} available={options.az} onChange={controller.setAz} />
      <SingleSelect label="Env" value={controller.query.env} available={options.env} onChange={controller.setEnv} />
      <div className="flex flex-col text-xs text-secondary">
        <span>Root</span>
        <form
          className="mt-0.5 flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (controller.addRoot(rootKind, rootValue)) {
              setRootValue('');
            }
          }}
        >
          <select
            aria-label="Root kind"
            className="rounded border border-medium bg-canvas px-1 py-1 text-primary"
            value={rootKind}
            onChange={(e) => setRootKind(e.currentTarget.value as SankeyRootKind)}
          >
            {ROOT_KINDS.map((item) => (
              <option key={item.kind} value={item.kind}>
                {item.label}
              </option>
            ))}
          </select>
          <input
            aria-label="Root value"
            className="min-w-32 rounded border border-medium bg-canvas px-1 py-1 text-primary"
            value={rootValue}
            onChange={(e) => setRootValue(e.currentTarget.value)}
          />
          <button type="submit" className="rounded border border-medium px-2 py-1 text-primary">
            Add
          </button>
        </form>
        {controller.podError !== undefined && (
          <span className="mt-0.5 text-[var(--ksg-status-warning)]" data-testid="sankey-pod-error">
            {controller.podError}
          </span>
        )}
      </div>
      {rootEntries(controller.query.roots).map((entry) => (
        <button
          key={`${entry.kind}:${entry.value}`}
          type="button"
          className="rounded border border-medium px-2 py-1 text-xs text-primary"
          onClick={() => controller.removeRoot(entry.kind, entry.value)}
        >
          {entry.kind}:{entry.value} ×
        </button>
      ))}
      {/* Optional narrowing over an enumerated set, unlike az / env: with nothing to
          enumerate there is nothing to narrow to, and the request is valid without them. */}
      {(options.cluster.length > 0 || controller.query.cluster.length > 0) && (
        <MultiSelect
          label="Cluster"
          values={controller.query.cluster}
          available={options.cluster}
          onChange={controller.setCluster}
        />
      )}
      {(options.namespace.length > 0 || controller.query.namespace.length > 0) && (
        <MultiSelect
          label="Namespace"
          values={controller.query.namespace}
          available={options.namespace}
          onChange={controller.setNamespace}
        />
      )}
      <p className="max-w-md text-[11px] leading-snug text-secondary">
        Node matches both NetApp controllers and Kubernetes nodes. Mixing storage-side and workload-side roots takes the
        intersection.
      </p>
    </div>
  );
}
