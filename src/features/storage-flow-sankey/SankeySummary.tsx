import type { JSX } from 'react';

import { MISSING_VALUE_PLACEHOLDER } from '../../shared/constants';
import { STATUS_COLOR } from '../../shared/constants/colorByStatus';
import type { NodeStatus } from '../../shared/constants/types';
import {
  SUMMARY_TD,
  SUMMARY_TD_NUM,
  SUMMARY_TH,
  SUMMARY_TH_NUM,
  SUMMARY_TR,
  SummaryPanel,
  SummarySection,
  SummaryTable,
} from '../../shared/ui/SummaryPanel';

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
  podCut?: { shown: number; total: number };
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
export function SankeySummary({ nodes, namespaces, applications, podCut }: Readonly<SankeySummaryProps>): JSX.Element {
  return (
    <SummaryPanel
      testId="sankey-summary"
      title="Flow summary"
      meta={
        <>
          {nodes.length} nodes · {applications.length} applications · {namespaces.length} namespaces
          {podCut !== undefined && podCut.shown < podCut.total
            ? ` · ${String(podCut.shown)} of ${String(podCut.total)} pods`
            : ''}
        </>
      }
    >
      <SummarySection title="Node flow summary">
        <SummaryTable
          minWidthClass="min-w-[620px]"
          head={
            <>
              <th className={SUMMARY_TH}>Tier</th>
              <th className={SUMMARY_TH}>Node</th>
              <th className={SUMMARY_TH_NUM}>In</th>
              <th className={SUMMARY_TH_NUM}>Out</th>
              <th className={SUMMARY_TH}>Usage</th>
              <th className={SUMMARY_TH}>Status</th>
              <th className={SUMMARY_TH}>Health</th>
              <th className={SUMMARY_TH}>Notes</th>
            </>
          }
        >
          {nodes.map((row) => (
            <tr key={row.id} className={SUMMARY_TR}>
              <td className={`${SUMMARY_TD} text-secondary`}>{row.tier}</td>
              <td className={`${SUMMARY_TD} font-medium text-primary`}>{row.label}</td>
              <td className={SUMMARY_TD_NUM}>{formatBytesPerSec(row.inbound)}</td>
              <td className={SUMMARY_TD_NUM}>{formatBytesPerSec(row.outbound)}</td>
              <td className={`${SUMMARY_TD} font-mono`}>{row.usage ?? MISSING_VALUE_PLACEHOLDER}</td>
              <td className={SUMMARY_TD}>
                <StatusCell status={row.status} />
              </td>
              <td className={SUMMARY_TD}>{row.health ?? MISSING_VALUE_PLACEHOLDER}</td>
              <td className={`${SUMMARY_TD} text-secondary`}>{row.derived === true ? 'derived' : ''}</td>
            </tr>
          ))}
        </SummaryTable>
      </SummarySection>

      {applications.length > 0 && (
        <SummarySection title="Application flow subtotal">
          <SummaryTable
            minWidthClass="min-w-[360px]"
            testId="sankey-application-subtotal"
            head={
              <>
                <th className={SUMMARY_TH}>Application</th>
                <th className={SUMMARY_TH}>Namespace</th>
                <th className={SUMMARY_TH_NUM}>Pods</th>
                <th className={SUMMARY_TH_NUM}>Total</th>
              </>
            }
          >
            {applications.map((row) => (
              // Keyed by namespace + name: one application name can exist in more than one
              // namespace, and the bare name would collide across those two rows.
              <tr key={`${row.namespace}/${row.application}`} className={SUMMARY_TR}>
                <td className={`${SUMMARY_TD} text-primary`}>{row.application}</td>
                <td className={`${SUMMARY_TD} text-secondary`}>{row.namespace}</td>
                <td className={SUMMARY_TD_NUM}>{row.podCount}</td>
                <td className={SUMMARY_TD_NUM}>{formatBytesPerSec(row.total)}</td>
              </tr>
            ))}
          </SummaryTable>
        </SummarySection>
      )}

      {namespaces.length > 0 && (
        <SummarySection title="Namespace flow subtotal">
          <SummaryTable
            minWidthClass="min-w-[320px]"
            head={
              <>
                <th className={SUMMARY_TH}>Namespace</th>
                <th className={SUMMARY_TH_NUM}>Pods</th>
                <th className={SUMMARY_TH_NUM}>Total</th>
              </>
            }
          >
            {namespaces.map((row) => (
              <tr key={row.namespace} className={SUMMARY_TR}>
                <td className={`${SUMMARY_TD} text-primary`}>{row.namespace}</td>
                <td className={SUMMARY_TD_NUM}>{row.podCount}</td>
                <td className={SUMMARY_TD_NUM}>{formatBytesPerSec(row.total)}</td>
              </tr>
            ))}
          </SummaryTable>
        </SummarySection>
      )}
    </SummaryPanel>
  );
}
