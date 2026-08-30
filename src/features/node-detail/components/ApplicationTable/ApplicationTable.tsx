import type { JSX } from 'react';

import { dataTableClass } from '../../../../shared/ui/table';
import { formatChangeTime } from '../../formatChangeTime';
import { ChangeReportCell } from '../ChangeReportCell';
import { ChangeTimeCell } from '../ChangeTimeCell';

import type { ApplicationTableProps } from './ApplicationTable.types';

export function ApplicationTable({ application, state }: Readonly<ApplicationTableProps>): JSX.Element {
  const isoCurrent = state.status === 'ready' ? state.currentTime : undefined;
  const isoPrevious = state.status === 'ready' ? state.previousTime : undefined;
  return (
    <div data-testid="application-table" className="overflow-x-auto">
      <table className={dataTableClass}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Current Version Time</th>
            <th>Previous Version Time</th>
            <th className="text-right">Deployment Changes</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="font-semibold">{application}</td>
            <td>
              <ChangeTimeCell
                formatted={formatChangeTime(isoCurrent)}
                {...(isoCurrent !== undefined ? { title: isoCurrent } : {})}
                testId="application-current"
              />
            </td>
            <td>
              <ChangeTimeCell
                formatted={formatChangeTime(isoPrevious)}
                {...(isoPrevious !== undefined ? { title: isoPrevious } : {})}
                testId="application-previous"
              />
            </td>
            <td>
              <ChangeReportCell state={state} idPrefix="application" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
