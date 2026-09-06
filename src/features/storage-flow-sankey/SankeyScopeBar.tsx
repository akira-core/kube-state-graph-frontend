import { useState, type JSX } from 'react';

import { Button } from '../../shared/ui/Button';
import { FilterIcon } from '../../shared/ui/icons';
import { ScopeSelect } from '../../shared/ui/ScopeSelect';
import { eyebrowClass } from '../../shared/ui/Section';
import type { StorageGraphRoots } from '../graph-data';

import { EMPTY_SANKEY_ROOT_OPTIONS, type SankeyRootOptions } from './deriveSankey';
import type { SankeyIdentityOptions, SankeyQueryController, SankeyRootKind } from './useSankeyQuery';

export interface SankeyScopeBarProps {
  options: SankeyIdentityOptions;
  controller: SankeyQueryController;
  /**
   * Root values offered per kind, from the body currently drawn. Optional and empty by
   * default: the control accepts custom values, so it stays fully operable with nothing
   * to list — which is also its state before the first response arrives.
   */
  rootOptions?: SankeyRootOptions;
  /** Kubernetes `node` roots that have nowhere to draw under the Flat layout. */
  k8sNodeHint?: ReadonlyArray<{ id: string; label: string }>;
}

const ROOT_KINDS: ReadonlyArray<{ kind: SankeyRootKind; label: string }> = [
  { kind: 'ontap_cluster', label: 'ONTAP cluster' },
  { kind: 'node', label: 'Node' },
  { kind: 'aggr', label: 'Aggregate' },
  { kind: 'svm', label: 'SVM' },
  { kind: 'pod', label: 'Pod' },
];

const ROOT_KIND_VALUES = ROOT_KINDS.map((item) => item.kind);

function rootKindLabel(value: string): string {
  return ROOT_KINDS.find((item) => item.kind === value)?.label ?? value;
}

function asSingle(value: string | undefined): string[] {
  return value === undefined || value === '' ? [] : [value];
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

/**
 * Sankey estate / root / narrowing. `az` / `env` stay operable with zero options
 * because custom values are allowed — the backend requires both, and a dropdown
 * that cannot accept a value would strand the view on the "pick an az and env" hint.
 *
 * Laid out as the Graph view's FilterBar is, and for the same reason: ONE row of
 * label-over-control columns on a shared baseline, then the prose underneath. Every control
 * here is a labelled column of the same height, `Add` included — a nested group with its own
 * heading (which "Root" used to be) puts a second label rank into a row that reads as one,
 * and the eye stops trusting the baseline. Roots, errors and hints sit on their own row so a
 * growing pill list can never reflow the controls.
 */
export function SankeyScopeBar({
  options,
  controller,
  rootOptions = EMPTY_SANKEY_ROOT_OPTIONS,
  k8sNodeHint = [],
}: Readonly<SankeyScopeBarProps>): JSX.Element {
  const [rootKind, setRootKind] = useState<SankeyRootKind>('aggr');
  const [rootValue, setRootValue] = useState('');
  const showCluster = options.cluster.length > 0 || controller.query.cluster.length > 0;
  const showNamespace = options.namespace.length > 0 || controller.query.namespace.length > 0;
  const roots = rootEntries(controller.query.roots);
  return (
    <div
      aria-label="Sankey scope"
      data-testid="sankey-controls"
      className="flex shrink-0 flex-col gap-2 border-b border-hairline bg-rail px-3 py-2.5"
    >
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <span className="flex h-8 items-center gap-1.5 pr-1 text-secondary">
          <FilterIcon size={14} />
          <span className={eyebrowClass}>Scope</span>
        </span>

        <ScopeSelect
          label="AZ"
          mode="single"
          options={options.az}
          value={asSingle(controller.query.az)}
          onChange={(next) => controller.setAz(next[0])}
          allowCustom
          testId="sankey-az"
        />
        <ScopeSelect
          label="Env"
          mode="single"
          options={options.env}
          value={asSingle(controller.query.env)}
          onChange={(next) => controller.setEnv(next[0])}
          allowCustom
          testId="sankey-env"
        />

        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (controller.addRoot(rootKind, rootValue)) {
              setRootValue('');
            }
          }}
        >
          <ScopeSelect
            label="Root kind"
            mode="single"
            options={ROOT_KIND_VALUES}
            optionLabel={rootKindLabel}
            value={[rootKind]}
            onChange={(next) => {
              const kind = next[0];
              if (kind === 'ontap_cluster' || kind === 'node' || kind === 'aggr' || kind === 'svm' || kind === 'pod') {
                setRootKind(kind);
                // A pending value belongs to the kind it was picked under: `aggr1` committed
                // as a `pod` root is a 400, and `svm_demo` committed as an `aggr` root is a
                // silently empty graph. Switching kind therefore drops it rather than
                // carrying it into a list that does not contain it.
                setRootValue('');
              }
            }}
            allowCustom={false}
            testId="sankey-root-kind"
          />
          {/* Same dropdown contract as every other control here. It offers the names the
              current body carries and still takes a typed one, because that body is a
              projection: it is the whole estate only while no root is applied. */}
          <ScopeSelect
            label="Root value"
            mode="single"
            options={rootOptions[rootKind]}
            value={rootValue === '' ? [] : [rootValue]}
            onChange={(next) => setRootValue(next[0] ?? '')}
            allowCustom
            emptyLabel="Select or type"
            testId="sankey-root-value"
          />
          <Button type="submit" size="md" disabled={rootValue === ''}>
            Add
          </Button>
        </form>

        {showCluster && (
          <ScopeSelect
            label="Cluster"
            mode="multi"
            options={options.cluster}
            value={controller.query.cluster}
            onChange={controller.setCluster}
            allowCustom
            testId="sankey-cluster"
          />
        )}
        {showNamespace && (
          <ScopeSelect
            label="Namespace"
            mode="multi"
            options={options.namespace}
            value={controller.query.namespace}
            onChange={controller.setNamespace}
            allowCustom
            testId="sankey-namespace"
          />
        )}
      </div>

      {(roots.length > 0 || controller.podError !== undefined) && (
        <div className="flex flex-wrap items-center gap-2">
          {roots.map((entry) => (
            <button
              key={`${entry.kind}:${entry.value}`}
              type="button"
              className="flex h-6 items-center rounded border border-medium px-2 text-xs text-primary transition-colors duration-100 hover:bg-raised-hover"
              onClick={() => controller.removeRoot(entry.kind, entry.value)}
            >
              {entry.kind}:{entry.value} ×
            </button>
          ))}
          {controller.podError !== undefined && (
            <span className="text-[11px] text-[var(--ksg-status-warning)]" data-testid="sankey-pod-error">
              {controller.podError}
            </span>
          )}
        </div>
      )}

      <div className="flex flex-col gap-0.5 text-[11px] leading-snug text-secondary">
        <p>
          Node matches both NetApp controllers and Kubernetes nodes. Mixing storage-side and workload-side roots takes
          the intersection.
        </p>
        {k8sNodeHint.length > 0 && (
          <p data-testid="sankey-k8s-node-hint">
            {k8sNodeHint.map((n) => n.label).join(', ')} {k8sNodeHint.length === 1 ? 'is a' : 'are'} Kubernetes{' '}
            {k8sNodeHint.length === 1 ? 'node' : 'nodes'} visible only under the Node layout.
          </p>
        )}
      </div>
    </div>
  );
}
