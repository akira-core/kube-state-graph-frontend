import { useState, type JSX } from 'react';

import { MISSING_VALUE_PLACEHOLDER } from '../../shared/constants';
import { STATUS_COLOR } from '../../shared/constants/colorByStatus';
import type { NodeStatus } from '../../shared/constants/types';
import { CaretDownIcon, CaretRightIcon } from '../../shared/ui/icons';
import { eyebrowClass } from '../../shared/ui/Section';

import { formatBytesPerSec } from './deriveSankey';

export interface NodeSummaryRow {
  id: string;
  tier: string;
  label: string;
  inbound: number;
  outbound: number;
  usage?: string;
  status?: NodeStatus;
  health?: string;
  derived?: boolean;
}

export interface NamespaceSubtotalRow {
  namespace: string;
  podCount: number;
  total: number;
}

export interface ApplicationSubtotalRow {
  application: string;
  namespace: string;
  podCount: number;
  total: number;
}

export interface SankeySummaryProps {
  nodes: NodeSummaryRow[];
  namespaces: NamespaceSubtotalRow[];
  applications: ApplicationSubtotalRow[];
}

/** The card border's colour, repeated as a dot so the table reads the same way the chart does. */
function StatusCell({ status }: Readonly<{ status: NodeStatus | undefined }>): JSX.Element {
  if (status === undefined) {
    return <span className="text-secondary">{MISSING_VALUE_PLACEHOLDER}</span>;
  }
  return (
    <span className="flex items-center gap-1.5" data-testid={`sankey-summary-status-${status}`}>
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLOR[status] }} />
      {status}
    </span>
  );
}

// Numbers that never enter a node card (spec: "圖外的數字摘要") — a full accounting for
// anyone who wants exact figures instead of reading ribbon widths.
//
// FOLDED by default, and the open/closed state is page-transient (local, reset on remount)
// exactly like the `Layout` control, so a shared URL never carries it. Six tiers make these
// tables tall enough to take half the column, and the chart — the thing the page is for —
// opened squeezed into what was left. The header strip stays drawn either way: a summary
// that disappears entirely is indistinguishable from one the estate has no numbers for.
export function SankeySummary({ nodes, namespaces, applications }: Readonly<SankeySummaryProps>): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex shrink-0 flex-col border-t border-hairline bg-surface" data-testid="sankey-summary">
      <button
        type="button"
        aria-expanded={open}
        data-testid="sankey-summary-toggle"
        className="flex h-9 shrink-0 items-center gap-2 px-3 text-left transition-colors duration-100 hover:bg-raised-hover"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span aria-hidden className="text-secondary">
          {open ? <CaretDownIcon size={12} /> : <CaretRightIcon size={12} />}
        </span>
        <span className={eyebrowClass}>Flow summary</span>
        <span className="text-[11px] text-secondary">
          {nodes.length} nodes · {applications.length} applications · {namespaces.length} namespaces
        </span>
      </button>

      {open && (
        <div className="ksg-scroll max-h-[45vh] min-h-0 space-y-4 overflow-y-auto px-3 pb-3">
          <div>
            <h3 className={eyebrowClass}>Node flow summary</h3>
            <div className="ksg-scroll mt-1.5 overflow-x-auto rounded-md border border-hairline">
              <table className="w-full min-w-[620px] text-[11px]">
                <thead>
                  <tr className="border-b border-hairline text-left text-secondary">
                    <th className="px-2 py-1 font-medium">Tier</th>
                    <th className="px-2 py-1 font-medium">Node</th>
                    <th className="px-2 py-1 text-right font-medium">In</th>
                    <th className="px-2 py-1 text-right font-medium">Out</th>
                    <th className="px-2 py-1 font-medium">Usage</th>
                    <th className="px-2 py-1 font-medium">Status</th>
                    <th className="px-2 py-1 font-medium">Health</th>
                    <th className="px-2 py-1 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {nodes.map((row) => (
                    <tr key={row.id} className="border-b border-hairline last:border-b-0">
                      <td className="px-2 py-1 text-secondary">{row.tier}</td>
                      <td className="px-2 py-1 font-medium text-primary">{row.label}</td>
                      <td className="px-2 py-1 text-right font-mono tabular-nums">{formatBytesPerSec(row.inbound)}</td>
                      <td className="px-2 py-1 text-right font-mono tabular-nums">{formatBytesPerSec(row.outbound)}</td>
                      <td className="px-2 py-1 font-mono">{row.usage ?? MISSING_VALUE_PLACEHOLDER}</td>
                      <td className="px-2 py-1">
                        <StatusCell status={row.status} />
                      </td>
                      <td className="px-2 py-1">{row.health ?? MISSING_VALUE_PLACEHOLDER}</td>
                      <td className="px-2 py-1 text-secondary">{row.derived === true ? 'derived' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {applications.length > 0 && (
            <div>
              <h3 className={eyebrowClass}>Application flow subtotal</h3>
              <div className="ksg-scroll mt-1.5 overflow-x-auto rounded-md border border-hairline">
                <table className="w-full min-w-[360px] text-[11px]" data-testid="sankey-application-subtotal">
                  <thead>
                    <tr className="border-b border-hairline text-left text-secondary">
                      <th className="px-2 py-1 font-medium">Application</th>
                      <th className="px-2 py-1 font-medium">Namespace</th>
                      <th className="px-2 py-1 text-right font-medium">Pods</th>
                      <th className="px-2 py-1 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {applications.map((row) => (
                      // Keyed by namespace + name: one application name can exist in more than one
                      // namespace, and the bare name would collide across those two rows.
                      <tr
                        key={`${row.namespace}/${row.application}`}
                        className="border-b border-hairline last:border-b-0"
                      >
                        <td className="px-2 py-1 text-primary">{row.application}</td>
                        <td className="px-2 py-1 text-secondary">{row.namespace}</td>
                        <td className="px-2 py-1 text-right font-mono tabular-nums">{row.podCount}</td>
                        <td className="px-2 py-1 text-right font-mono tabular-nums">{formatBytesPerSec(row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {namespaces.length > 0 && (
            <div>
              <h3 className={eyebrowClass}>Namespace flow subtotal</h3>
              <div className="ksg-scroll mt-1.5 overflow-x-auto rounded-md border border-hairline">
                <table className="w-full min-w-[320px] text-[11px]">
                  <thead>
                    <tr className="border-b border-hairline text-left text-secondary">
                      <th className="px-2 py-1 font-medium">Namespace</th>
                      <th className="px-2 py-1 text-right font-medium">Pods</th>
                      <th className="px-2 py-1 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {namespaces.map((row) => (
                      <tr key={row.namespace} className="border-b border-hairline last:border-b-0">
                        <td className="px-2 py-1 text-primary">{row.namespace}</td>
                        <td className="px-2 py-1 text-right font-mono tabular-nums">{row.podCount}</td>
                        <td className="px-2 py-1 text-right font-mono tabular-nums">{formatBytesPerSec(row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
