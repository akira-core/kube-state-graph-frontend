import type { JSX } from 'react';

import { MISSING_VALUE_PLACEHOLDER } from '../../shared/constants';
import { countWord } from '../../shared/format/countWord';
import { formatBitsPerSec, formatDeltaBps } from '../../shared/format/measurements';
import { eyebrowClass } from '../../shared/ui/Section';
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

import type { HopBalanceRow, NamespaceAgg } from './model/aggregates';

export interface TraceSummaryProps {
  hops: HopBalanceRow[];
  namespaces: NamespaceAgg[];
  warnings: string[];
}

/**
 * The numbers behind the chart: every hop's balance sheet and the namespace subtotal, in
 * the storage summary's folded panel. A namespace with no metered pod prints the
 * placeholder, never 0 — nothing was measured, which is not a measured zero.
 */
export function TraceSummary({ hops, namespaces, warnings }: Readonly<TraceSummaryProps>): JSX.Element {
  return (
    <SummaryPanel
      testId="trace-summary"
      title="Hop balance"
      meta={
        <>
          {hops.length} hops · {namespaces.length} namespaces
          {warnings.length > 0 ? ` · ${countWord(warnings.length, 'warning')}` : ''}
        </>
      }
    >
      <SummarySection title="Per-hop balance (traced in + other in = traced out + other out)">
        <SummaryTable
          minWidthClass="min-w-[520px]"
          testId="trace-hop-table"
          head={
            <>
              <th className={SUMMARY_TH}>Hop</th>
              <th className={SUMMARY_TH_NUM}>Traced in</th>
              <th className={SUMMARY_TH_NUM}>Traced out</th>
              <th className={SUMMARY_TH_NUM}>Other in</th>
              <th className={SUMMARY_TH_NUM}>Other out</th>
            </>
          }
        >
          {hops.map((row) => (
            <tr key={row.id} className={SUMMARY_TR}>
              <td className={`${SUMMARY_TD} font-medium text-primary`}>
                {row.label}
                {row.id !== row.label && <span className="ml-1 text-secondary">{row.id}</span>}
                {row.noFlow && <span className="ml-1 text-secondary">(no flow)</span>}
              </td>
              <td className={SUMMARY_TD_NUM}>{formatBitsPerSec(row.tracedIn)}</td>
              <td className={SUMMARY_TD_NUM}>{formatBitsPerSec(row.tracedOut)}</td>
              <td className={SUMMARY_TD_NUM}>
                {row.otherIn > 0 ? formatDeltaBps(row.otherIn) : MISSING_VALUE_PLACEHOLDER}
              </td>
              <td className={SUMMARY_TD_NUM}>
                {row.otherOut > 0 ? formatDeltaBps(row.otherOut) : MISSING_VALUE_PLACEHOLDER}
              </td>
            </tr>
          ))}
        </SummaryTable>
      </SummarySection>

      {namespaces.length > 0 && (
        <SummarySection title="Namespace subtotal">
          <SummaryTable
            minWidthClass="min-w-[320px]"
            testId="trace-namespace-table"
            head={
              <>
                <th className={SUMMARY_TH}>Namespace</th>
                <th className={SUMMARY_TH_NUM}>Pods (metered / all)</th>
                <th className={SUMMARY_TH_NUM}>Total</th>
              </>
            }
          >
            {namespaces.map((row) => (
              <tr key={row.namespace} className={SUMMARY_TR}>
                <td className={`${SUMMARY_TD} text-primary`}>{row.namespace}</td>
                <td className={SUMMARY_TD_NUM}>
                  {row.pods} / {row.podsTotal}
                </td>
                <td className={SUMMARY_TD_NUM}>
                  {row.pods > 0 ? formatDeltaBps(row.total) : MISSING_VALUE_PLACEHOLDER}
                </td>
              </tr>
            ))}
          </SummaryTable>
        </SummarySection>
      )}

      {warnings.length > 0 && (
        <div>
          <h3 className={eyebrowClass}>Warnings</h3>
          <ul className="mt-1.5 space-y-1 text-[11px] text-secondary" data-testid="trace-warnings">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </SummaryPanel>
  );
}
