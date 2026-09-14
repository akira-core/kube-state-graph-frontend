import { useState, type JSX } from 'react';

import { FilterIcon } from '../../shared/ui/icons';
import { QueryButton } from '../../shared/ui/QueryButton';
import { ScopeSelect } from '../../shared/ui/ScopeSelect';
import { eyebrowClass } from '../../shared/ui/Section';
import { hasAnyRoot, type StorageGraphRoots } from '../graph-data';

import { EMPTY_SANKEY_ROOT_OPTIONS, type SankeyRootOptions } from './deriveSankey';
import { DEFAULT_TOP_PODS } from './sankeyUrlScope';
import type { SankeyIdentityOptions, SankeyQueryController, SankeyRootKind } from './useSankeyQuery';

export interface SankeyScopeBarProps {
  options: SankeyIdentityOptions;
  controller: SankeyQueryController;
  rootOptions?: SankeyRootOptions;
  dirty?: boolean;
  inFlight?: boolean;
  onQuery?: () => void;
  onCancel?: () => void;
  topPods?: number;
  onTopPods?: (value: number) => void;
  hideQuery?: boolean;
  onRootKindChange?: (kind: SankeyRootKind) => void;
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

function emptyHintFor(kind: SankeyRootKind, namespaces: readonly string[]): string | undefined {
  if (kind === 'pod' && namespaces.length === 0) {
    return 'Select a namespace to list pods, or type a value as <namespace>/<pod>.';
  }
  if (kind === 'ontap_cluster' || kind === 'aggr' || kind === 'svm') {
    return 'These names are typed until a query has drawn them.';
  }
  return undefined;
}

function queryDisabledReason(azEnvReady: boolean, hasRoot: boolean): string | undefined {
  if (azEnvReady && hasRoot) {
    return undefined;
  }
  if (azEnvReady) {
    return 'At least one root is required';
  }
  return 'Select one az, one env and at least one root';
}

/**
 * Sankey estate / root / narrowing. Laid out as the Graph view's FilterBar is: ONE row of
 * label-over-control columns on a shared baseline, closed by the Query action, with the
 * roots and their errors underneath.
 */
export function SankeyScopeBar({
  options,
  controller,
  rootOptions = EMPTY_SANKEY_ROOT_OPTIONS,
  dirty = false,
  inFlight = false,
  onQuery = () => undefined,
  onCancel = () => undefined,
  topPods = DEFAULT_TOP_PODS,
  onTopPods,
  hideQuery = false,
  onRootKindChange,
}: Readonly<SankeyScopeBarProps>): JSX.Element {
  const [rootKind, setRootKind] = useState<SankeyRootKind>('aggr');
  const showCluster = options.cluster.length > 0 || controller.query.cluster.length > 0;
  const showNamespace = options.namespace.length > 0 || controller.query.namespace.length > 0;
  const roots = rootEntries(controller.query.roots);
  const kindRoots = controller.query.roots[rootKind];
  const hasRoot = hasAnyRoot(controller.query.roots);
  const hasPodRoot = controller.query.roots.pod.length > 0;
  const disabledReason = queryDisabledReason(controller.azEnvReady, hasRoot);
  const hint = emptyHintFor(rootKind, controller.query.namespace);

  // The checked values ARE this kind's draft roots: checking one adds it, unchecking removes
  // it. The draft is already what Query commits, so a second pending list confirmed by an
  // Add would only be one more step between a pick and the pill it produces.
  const setKindRoots = (next: string[]): void => {
    const added = next.filter((value) => !kindRoots.includes(value));
    if (added.length > 0) {
      controller.addRoots(rootKind, added);
    }
    for (const value of kindRoots) {
      if (!next.includes(value)) {
        controller.removeRoot(rootKind, value);
      }
    }
  };

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
              onRootKindChange?.(kind);
            }
          }}
          allowCustom={false}
          testId="sankey-root-kind"
        />
        <ScopeSelect
          label="Root value"
          mode="multi"
          options={rootOptions[rootKind]}
          value={kindRoots}
          onChange={setKindRoots}
          allowCustom
          allRow={false}
          emptyLabel="Pick values"
          {...(hint !== undefined ? { emptyHint: hint } : {})}
          testId="sankey-root-value"
        />

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

        <div className="flex min-w-[5.5rem] flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-eyebrow text-secondary">Top pods</span>
          <input
            type="number"
            min={1}
            step={1}
            aria-label="Top pods"
            data-testid="sankey-top-pods"
            disabled={hasPodRoot}
            title={hasPodRoot ? 'A pod root names the pods' : undefined}
            value={topPods}
            onChange={(e) => {
              const n = Number(e.currentTarget.value);
              if (Number.isInteger(n) && n >= 1) {
                onTopPods?.(n);
              }
            }}
            className="h-8 w-[5.5rem] rounded-md border border-hairline-strong bg-raised px-2 font-mono text-xs text-primary disabled:opacity-45"
          />
        </div>
        {hasPodRoot && (
          <span className="mb-1.5 text-[11px] text-secondary" data-testid="sankey-top-pods-reason">
            A pod root names the pods
          </span>
        )}

        {!hideQuery && (
          <QueryButton
            dirty={dirty}
            inFlight={inFlight}
            disabled={disabledReason !== undefined}
            {...(disabledReason !== undefined ? { disabledReason } : {})}
            onQuery={onQuery}
            onCancel={onCancel}
          />
        )}
      </div>

      {(roots.length > 0 || controller.podError !== undefined || !hasRoot) && (
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
          {!hasRoot && (
            <span className="text-[11px] text-secondary" data-testid="sankey-root-required">
              At least one root is required
            </span>
          )}
        </div>
      )}
    </div>
  );
}
