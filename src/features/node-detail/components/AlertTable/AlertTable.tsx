import * as Tooltip from '@radix-ui/react-tooltip';
import type { JSX } from 'react';

import { severityColor } from '../../../../shared/constants/colorBySeverity';
import { MISSING_VALUE_PLACEHOLDER } from '../../../../shared/constants/missingValuePlaceholder';
import type { NodeAlert } from '../../../../shared/constants/types';
import { dataTableClass } from '../../../../shared/ui/table';
import { formatChangeTime } from '../../formatChangeTime';

import type { AlertTableProps } from './AlertTable.types';

function lastSeen(alert: NodeAlert): number {
  return alert.timeRecords.length > 0 ? (alert.timeRecords[alert.timeRecords.length - 1] as number) : 0;
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
            const t = lastSeen(alert);
            return (
              <tr key={`${alert.id ?? alert.name}-${String(index)}`}>
                <td className={alert.pod === undefined ? 'text-muted' : undefined}>
                  {alert.pod ?? MISSING_VALUE_PLACEHOLDER}
                </td>
                <td className={alert.service === undefined ? 'text-muted' : undefined}>
                  {alert.service ?? MISSING_VALUE_PLACEHOLDER}
                </td>
                <td>{alert.name}</td>
                <td>
                  <span
                    className="inline-block rounded-full px-1.5 py-px text-[10px] font-semibold uppercase text-black"
                    style={{ backgroundColor: severityColor(alert.severity) }}
                    data-testid="alert-severity"
                  >
                    {alert.severity}
                  </span>
                </td>
                <td>
                  <Tooltip.Root>
                    <Tooltip.Trigger asChild>
                      <span
                        className="inline-block min-w-[18px] cursor-default rounded-full border border-secondary px-1.5 text-center text-[11px] font-semibold text-secondary"
                        data-testid="alert-count"
                        tabIndex={0}
                        title={alert.timeRecords.map(fmt).join('\n')}
                      >
                        {alert.timeRecords.length}
                      </span>
                    </Tooltip.Trigger>
                    <Tooltip.Portal>
                      <Tooltip.Content className="z-[1200] rounded bg-elevated px-2 py-1 text-xs shadow" sideOffset={4}>
                        <div className="flex flex-col gap-0.5 font-mono">
                          {alert.timeRecords.map((occ, i) => (
                            <span key={`${String(occ)}-${String(i)}`}>{fmt(occ)}</span>
                          ))}
                        </div>
                      </Tooltip.Content>
                    </Tooltip.Portal>
                  </Tooltip.Root>
                  <div className="hidden" data-testid="alert-occurrences">
                    {alert.timeRecords.map((occ, i) => (
                      <span key={`${String(occ)}-${String(i)}`}>{fmt(occ)}</span>
                    ))}
                  </div>
                </td>
                <td>
                  <button
                    type="button"
                    className="cursor-pointer border-0 bg-transparent p-0 font-inherit text-link underline"
                    data-testid="alert-time"
                    onClick={() => onAlertTimeClick(t)}
                  >
                    {fmt(t)}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Tooltip.Provider>
  );
}
