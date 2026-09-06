import * as Tooltip from '@radix-ui/react-tooltip';
import type { JSX } from 'react';

import { severityColor } from '../../../../shared/constants/colorBySeverity';
import { MISSING_VALUE_PLACEHOLDER } from '../../../../shared/constants/missingValuePlaceholder';
import type { NodeAlert } from '../../../../shared/constants/types';
import { dataTableClass } from '../../../../shared/ui/table';
import { formatChangeTime } from '../../formatChangeTime';

import type { AlertTableProps } from './AlertTable.types';

// Occurrence times of one alert, or [] when the producer reports none. `timeRecords` is
// optional and is never written empty, so this is the single place the two spellings of
// "no history" collapse into one.
function occurrences(alert: NodeAlert): readonly number[] {
  return alert.timeRecords ?? [];
}

// Ascending by contract, so the last element is the most recent.
function lastSeen(times: readonly number[]): number | undefined {
  return times.length > 0 ? times[times.length - 1] : undefined;
}

function fmt(timeSec: number): string {
  return formatChangeTime(new Date(timeSec * 1000).toISOString()) ?? String(timeSec);
}

export function AlertTable({ alerts, onAlertTimeClick }: Readonly<AlertTableProps>): JSX.Element {
  if (alerts.length === 0) {
    return (
      <div className="py-1 italic text-secondary" data-testid="alert-table-empty">
        No alerts
      </div>
    );
  }
  return (
    <Tooltip.Provider delayDuration={200}>
      <table className={dataTableClass}>
        <thead>
          <tr>
            <th>Pod</th>
            <th>Service</th>
            <th>Alert</th>
            <th>Severity</th>
            <th>Count</th>
            <th>Last occurred</th>
          </tr>
        </thead>
        <tbody>
          {alerts.map((alert, index) => {
            const times = occurrences(alert);
            const t = lastSeen(times);
            return (
              <tr key={`${alert.id ?? alert.name}-${String(index)}`}>
                <td className={alert.pod === undefined ? 'text-muted' : undefined}>
                  {alert.pod ?? MISSING_VALUE_PLACEHOLDER}
                </td>
                <td className={alert.service === undefined ? 'text-muted' : undefined}>
                  {alert.service ?? MISSING_VALUE_PLACEHOLDER}
                </td>
                <td>{alert.name}</td>
                {/* An absent severity is not an unrecognised one: a custom label gets the
                    fallback colour, but a grade the producer never stated gets the
                    placeholder — a badge would assert a severity nobody assigned. */}
                <td className={alert.severity === undefined ? 'text-muted' : undefined}>
                  {alert.severity === undefined ? (
                    MISSING_VALUE_PLACEHOLDER
                  ) : (
                    <span
                      className="inline-block rounded-full px-1.5 py-px text-[10px] font-semibold uppercase text-black"
                      style={{ backgroundColor: severityColor(alert.severity) }}
                      data-testid="alert-severity"
                    >
                      {alert.severity}
                    </span>
                  )}
                </td>
                {/* Count and Last occurred are BOTH derived from the occurrence list, so
                    an alert with no history degrades both to the panel-wide placeholder
                    rather than showing a made-up 0 and an epoch date. */}
                <td className={times.length === 0 ? 'text-muted' : undefined}>
                  {times.length === 0 ? (
                    MISSING_VALUE_PLACEHOLDER
                  ) : (
                    <>
                      <Tooltip.Root>
                        <Tooltip.Trigger asChild>
                          <span
                            className="inline-block min-w-[18px] cursor-default rounded-full border border-secondary px-1.5 text-center text-[11px] font-semibold text-secondary"
                            data-testid="alert-count"
                            tabIndex={0}
                            title={times.map(fmt).join('\n')}
                          >
                            {times.length}
                          </span>
                        </Tooltip.Trigger>
                        <Tooltip.Portal>
                          <Tooltip.Content
                            className="z-[1200] rounded bg-elevated px-2 py-1 text-xs shadow"
                            sideOffset={4}
                          >
                            <div className="flex flex-col gap-0.5 font-mono">
                              {times.map((occ, i) => (
                                <span key={`${String(occ)}-${String(i)}`}>{fmt(occ)}</span>
                              ))}
                            </div>
                          </Tooltip.Content>
                        </Tooltip.Portal>
                      </Tooltip.Root>
                      <div className="hidden" data-testid="alert-occurrences">
                        {times.map((occ, i) => (
                          <span key={`${String(occ)}-${String(i)}`}>{fmt(occ)}</span>
                        ))}
                      </div>
                    </>
                  )}
                </td>
                {/* Not a button when there is no time: the click rewinds the view window
                    to that instant, and there is no instant to rewind to. */}
                <td className={t === undefined ? 'text-muted' : undefined}>
                  {t === undefined ? (
                    MISSING_VALUE_PLACEHOLDER
                  ) : (
                    <button
                      type="button"
                      className="cursor-pointer border-0 bg-transparent p-0 font-inherit text-link underline"
                      data-testid="alert-time"
                      onClick={() => onAlertTimeClick(t)}
                    >
                      {fmt(t)}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Tooltip.Provider>
  );
}
