import { clsx } from 'clsx';
import React from 'react';

import { CATEGORY_ORDER, categoryForKind, type NodeCategory } from '../../../../shared/constants/categoryByKind';
import { ICON_SVG_BY_KIND } from '../../../../shared/constants/iconSvgByKind';
import { EyeButton } from '../../../../shared/ui/EyeButton';
import { legendDimmedClass, legendListClass, legendRowClass, legendToggleClass } from '../../legendStyles';
import { IconGlyph } from '../IconGlyph';

// Group the given entries by super-category (colour never encodes category — this
// is purely a legend grouping aid). Unknown kinds fall into 'Other' via
// categoryForKind, so a kind the backend sends that has no icon still appears.
function entriesByCategory(entries: readonly NodeLegendKindEntry[]): Map<NodeCategory, NodeLegendKindEntry[]> {
  const grouped = new Map<NodeCategory, NodeLegendKindEntry[]>();
  for (const entry of entries) {
    const category = categoryForKind(entry.kind);
    const existing = grouped.get(category);
    if (existing) {
      existing.push(entry);
    } else {
      grouped.set(category, [entry]);
    }
  }
  return grouped;
}

// Display-name overrides for kinds whose raw id reads poorly as a legend label.
const LABEL_BY_KIND: Record<string, string> = {
  network: 'physical network',
};

// One legend row: the kind to draw plus its display flags. `hidden` fades the
// row and flips the eye to "Show"; rows with `togglable: false` render no eye
// button at all — the producer decides which kinds are filterable.
export interface NodeLegendKindEntry {
  kind: string;
  hidden: boolean;
  togglable: boolean;
}

// Every known kind as a plain visible row — the no-props fallback (isolated
// rendering/tests). Static input, so built once.
const DEFAULT_ENTRIES: readonly NodeLegendKindEntry[] = Object.keys(ICON_SVG_BY_KIND).map((kind) => ({
  kind,
  hidden: false,
  togglable: false,
}));

export interface NodeLegendProps {
  // The rows to list. Pass the entries derived from the graph to show the live
  // filter state; omit to list every known kind as a plain visible row.
  entries?: readonly NodeLegendKindEntry[];
  // Show/hide toggle callback, invoked with the row's kind. Omit for a
  // read-only legend (no buttons render). Buttons also need togglable entries:
  // the no-`entries` fallback rows are all non-togglable, so passing only this
  // prop still renders a read-only legend.
  onToggleKind?: (kind: string) => void;
}

export function NodeLegend({ entries, onToggleKind }: Readonly<NodeLegendProps> = {}): React.JSX.Element | null {
  const presentEntries = entries ?? DEFAULT_ENTRIES;
  const grouped = entriesByCategory(presentEntries);
  // Mirror ClusterLegend: nothing to show → render nothing.
  if (presentEntries.length === 0) {
    return null;
  }
  return (
    <div data-testid="node-legend">
      <h4 className="mb-1 text-sm font-semibold">Node Kinds</h4>
      {CATEGORY_ORDER.filter((category) => (grouped.get(category)?.length ?? 0) > 0).map((category) => (
        <div key={category} className="mb-1.5" data-testid={`node-legend-group-${category}`}>
          <div className="mb-0.5 mt-1.5 text-[10px] font-semibold uppercase tracking-wide opacity-60">{category}</div>
          <ul className={legendListClass}>
            {(grouped.get(category) ?? []).map((entry) => {
              const label = LABEL_BY_KIND[entry.kind] ?? entry.kind;
              return (
                <li key={entry.kind} className={legendRowClass} data-testid={`node-legend-row-${entry.kind}`}>
                  <span
                    className={clsx(
                      'inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center',
                      entry.hidden && legendDimmedClass
                    )}
                  >
                    <IconGlyph kind={entry.kind} />
                  </span>
                  <span className={clsx(entry.hidden && legendDimmedClass)}>{label}</span>
                  {onToggleKind !== undefined && entry.togglable && (
                    <EyeButton
                      className={legendToggleClass}
                      name={entry.hidden ? 'eye-slash' : 'eye'}
                      size="lg"
                      tooltip={`${entry.hidden ? 'Show' : 'Hide'} ${label}`}
                      onClick={() => onToggleKind(entry.kind)}
                      data-testid={`node-legend-toggle-${entry.kind}`}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
