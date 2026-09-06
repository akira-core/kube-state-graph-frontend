import type { JSX } from 'react';

import { MISSING_VALUE_PLACEHOLDER } from '../../shared/constants';
import { eyebrowClass } from '../../shared/ui/Section';

import { formatBytesPerSec } from './deriveSankey';

export interface NodeSummaryRow {
  id: string;
  tier: string;
  label: string;
  inbound: number;
  outbound: number;
  usage?: string;
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

// Numbers that never enter a node card (spec: "圖外的數字摘要") — a full accounting for
// anyone who wants exact figures instead of reading ribbon widths.
export function SankeySummary({ nodes, namespaces, applications }: Readonly<SankeySummaryProps>): JSX.Element {
  return (
    <div
      className="ksg-scroll max-h-[45%] shrink-0 space-y-4 overflow-y-auto border-t border-hairline bg-surface p-3"
      data-testid="sankey-summary"
    >
      <div>
        <h3 className={eyebrowClass}>Node flow summary</h3>
        <div className="ksg-scroll mt-1.5 overflow-x-auto rounded-md border border-hairline">
          <table className="w-full min-w-[560px] text-[11px]">
            <thead>
              <tr className="border-b border-hairline text-left text-secondary">
                <th className="px-2 py-1 font-medium">Tier</th>
                <th className="px-2 py-1 font-medium">Node</th>
                <th className="px-2 py-1 text-right font-medium">In</th>
                <th className="px-2 py-1 text-right font-medium">Out</th>
                <th className="px-2 py-1 font-medium">Usage</th>
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
                  <tr key={`${row.namespace}/${row.application}`} className="border-b border-hairline last:border-b-0">
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
  );
}
