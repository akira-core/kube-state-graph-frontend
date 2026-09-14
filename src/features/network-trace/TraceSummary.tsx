import { useState, type JSX } from 'react';

import { MISSING_VALUE_PLACEHOLDER } from '../../shared/constants';
import { formatBitsPerSec, formatDeltaBps } from '../../shared/format/measurements';
import { CaretDownIcon, CaretRightIcon } from '../../shared/ui/icons';
import { eyebrowClass } from '../../shared/ui/Section';

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
  const [open, setOpen] = useState(false);
  return (
    <div className="flex shrink-0 flex-col border-t border-hairline bg-surface" data-testid="trace-summary">
      <button
        type="button"
        aria-expanded={open}
        data-testid="trace-summary-toggle"
        className="flex h-9 shrink-0 items-center gap-2 px-3 text-left transition-colors duration-100 hover:bg-raised-hover"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span aria-hidden className="text-secondary">
          {open ? <CaretDownIcon size={12} /> : <CaretRightIcon size={12} />}
        </span>
        <span className={eyebrowClass}>Hop balance</span>
        <span className="text-[11px] text-secondary">
          {hops.length} hops · {namespaces.length} namespaces
          {warnings.length > 0 ? ` · ${String(warnings.length)} warning${warnings.length === 1 ? '' : 's'}` : ''}
        </span>
      </button>

      {open && (
        <div className="ksg-scroll max-h-[45vh] min-h-0 space-y-4 overflow-y-auto px-3 pb-3">
          <div>
            <h3 className={eyebrowClass}>Per-hop balance (traced in + other in = traced out + other out)</h3>
            <div className="ksg-scroll mt-1.5 overflow-x-auto rounded-md border border-hairline">
              <table className="w-full min-w-[520px] text-[11px]" data-testid="trace-hop-table">
                <thead>
                  <tr className="border-b border-hairline text-left text-secondary">
                    <th className="px-2 py-1 font-medium">Hop</th>
                    <th className="px-2 py-1 text-right font-medium">Traced in</th>
                    <th className="px-2 py-1 text-right font-medium">Traced out</th>
                    <th className="px-2 py-1 text-right font-medium">Other in</th>
                    <th className="px-2 py-1 text-right font-medium">Other out</th>
                  </tr>
                </thead>
                <tbody>
                  {hops.map((row) => (
                    <tr key={row.id} className="border-b border-hairline last:border-b-0">
                      <td className="px-2 py-1 font-medium text-primary">
                        {row.label}
                        {row.id !== row.label && <span className="ml-1 text-secondary">{row.id}</span>}
                        {row.noFlow && <span className="ml-1 text-secondary">(no flow)</span>}
                      </td>
                      <td className="px-2 py-1 text-right font-mono tabular-nums">{formatBitsPerSec(row.tracedIn)}</td>
                      <td className="px-2 py-1 text-right font-mono tabular-nums">{formatBitsPerSec(row.tracedOut)}</td>
                      <td className="px-2 py-1 text-right font-mono tabular-nums">
                        {row.otherIn > 0 ? formatDeltaBps(row.otherIn) : MISSING_VALUE_PLACEHOLDER}
                      </td>
                      <td className="px-2 py-1 text-right font-mono tabular-nums">
                        {row.otherOut > 0 ? formatDeltaBps(row.otherOut) : MISSING_VALUE_PLACEHOLDER}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {namespaces.length > 0 && (
            <div>
              <h3 className={eyebrowClass}>Namespace subtotal</h3>
              <div className="ksg-scroll mt-1.5 overflow-x-auto rounded-md border border-hairline">
                <table className="w-full min-w-[320px] text-[11px]" data-testid="trace-namespace-table">
                  <thead>
                    <tr className="border-b border-hairline text-left text-secondary">
                      <th className="px-2 py-1 font-medium">Namespace</th>
                      <th className="px-2 py-1 text-right font-medium">Pods (metered / all)</th>
                      <th className="px-2 py-1 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {namespaces.map((row) => (
                      <tr key={row.namespace} className="border-b border-hairline last:border-b-0">
                        <td className="px-2 py-1 text-primary">{row.namespace}</td>
                        <td className="px-2 py-1 text-right font-mono tabular-nums">
                          {row.pods} / {row.podsTotal}
                        </td>
                        <td className="px-2 py-1 text-right font-mono tabular-nums">
                          {row.pods > 0 ? formatDeltaBps(row.total) : MISSING_VALUE_PLACEHOLDER}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
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
        </div>
      )}
    </div>
  );
}
