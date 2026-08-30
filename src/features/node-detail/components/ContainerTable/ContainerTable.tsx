import type { JSX } from 'react';

import { formatChangeTime } from '../../formatChangeTime';
import type { DetailLookup } from '../../hooks/useNodeDetailUrls';
import { ChangeReportCell } from '../ChangeReportCell';
import { ChangeTimeCell } from '../ChangeTimeCell';
import { ChangeTypeCell } from '../ChangeTypeCell';

import type { ContainerTableProps } from './ContainerTable.types';

function rowLookup(lookups: ContainerTableProps['lookups'], name: string): DetailLookup {
  if (lookups.phase === 'loading') {
    return { status: 'loading' };
  }
  if (Object.hasOwn(lookups.byName, name)) {
    return lookups.byName[name] ?? { status: 'unavailable' };
  }
  return { status: 'unavailable' };
}

export function ContainerTable({ containers, lookups }: Readonly<ContainerTableProps>): JSX.Element {
  return (
    <div data-testid="container-table" className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            <th>Name</th>
            <th>Image</th>
            <th>Change Type</th>
            <th>Current Version Time</th>
            <th>Previous Version Time</th>
            <th className="text-right">Code Changes</th>
          </tr>
        </thead>
        <tbody>
          {containers.map((c) => {
            const lk = rowLookup(lookups, c.name);
            const isoCurrent = lk.status === 'ready' ? lk.currentTime : undefined;
            const isoPrevious = lk.status === 'ready' ? lk.previousTime : undefined;
            const type = lk.status === 'ready' ? lk.resultType : undefined;
            return (
              <tr key={`${c.name}/${c.image}`}>
                <td className="whitespace-nowrap font-semibold">{c.name}</td>
                <td className="break-all font-mono text-xs text-secondary">{c.image}</td>
                <td>
                  <ChangeTypeCell type={type} testId="container-type" />
                </td>
                <td>
                  <ChangeTimeCell
                    formatted={formatChangeTime(isoCurrent)}
                    {...(isoCurrent !== undefined ? { title: isoCurrent } : {})}
                    testId="container-current"
                  />
                </td>
                <td>
                  <ChangeTimeCell
                    formatted={formatChangeTime(isoPrevious)}
                    {...(isoPrevious !== undefined ? { title: isoPrevious } : {})}
                    testId="container-previous"
                  />
                </td>
                <td>
                  <ChangeReportCell state={lk} idPrefix="container" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
