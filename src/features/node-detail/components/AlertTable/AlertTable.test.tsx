import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import { FALLBACK_SEVERITY_COLOR, SEVERITY_COLOR } from '../../../../shared/constants/colorBySeverity';
import type { NodeAlert } from '../../../../shared/constants/types';
import { formatChangeTime } from '../../formatChangeTime';

import { AlertTable } from './AlertTable';

function localTime(sec: number): string {
  return formatChangeTime(new Date(sec * 1000).toISOString()) ?? '';
}

const alerts: NodeAlert[] = [
  {
    pod: 'mongo-0',
    service: 'mongo',
    name: 'HighMemory',
    severity: 'critical',
    timeRecords: [1717500000, 1717500600, 1717501200], // 3 occurrences
    id: 'a1',
  },
  { name: 'PodRestart', severity: 'warning', timeRecords: [1717500300] }, // single occurrence, no pod/service
];

describe('AlertTable', () => {
  it('renders a row per alert with the six columns', () => {
    render(<AlertTable alerts={alerts} onAlertTimeClick={jest.fn()} timeZone="utc" />);
    for (const header of ['Pod', 'Service', 'Alert', 'Severity', 'Count', 'Last occurred']) {
      expect(screen.getByRole('columnheader', { name: header })).toBeInTheDocument();
    }
    expect(screen.getByText('HighMemory')).toBeInTheDocument();
    expect(screen.getByText('PodRestart')).toBeInTheDocument();
    expect(screen.getByText('mongo-0')).toBeInTheDocument();
  });

  it('shows n/a for missing pod/service', () => {
    render(<AlertTable alerts={[alerts[1]!]} onAlertTimeClick={jest.fn()} timeZone="utc" />);
    expect(screen.getAllByText('n/a')).toHaveLength(2); // pod + service
  });

  it('colours the severity badge from SEVERITY_COLOR', () => {
    render(<AlertTable alerts={alerts} onAlertTimeClick={jest.fn()} timeZone="utc" />);
    const badges = screen.getAllByTestId('alert-severity');
    expect(badges[0]).toHaveStyle({ backgroundColor: SEVERITY_COLOR.critical });
    expect(badges[1]).toHaveStyle({ backgroundColor: SEVERITY_COLOR.warning });
  });

  it('colours an info severity badge from SEVERITY_COLOR', () => {
    const info: NodeAlert[] = [{ name: 'Rollout', severity: 'info', timeRecords: [1717500000] }];
    render(<AlertTable alerts={info} onAlertTimeClick={jest.fn()} timeZone="utc" />);
    expect(screen.getByTestId('alert-severity')).toHaveStyle({ backgroundColor: SEVERITY_COLOR.info });
  });

  it('renders an unknown/custom severity with its literal label in the critical fallback colour', () => {
    const custom: NodeAlert[] = [{ name: 'X', severity: 'fatal', timeRecords: [1717500000] }];
    render(<AlertTable alerts={custom} onAlertTimeClick={jest.fn()} timeZone="utc" />);
    const badge = screen.getByTestId('alert-severity');
    expect(badge).toHaveStyle({ backgroundColor: FALLBACK_SEVERITY_COLOR });
    expect(badge).toHaveTextContent('fatal');
  });

  it('shows the occurrence count from timeRecords.length', () => {
    render(<AlertTable alerts={alerts} onAlertTimeClick={jest.fn()} timeZone="utc" />);
    const counts = screen.getAllByTestId('alert-count');
    expect(counts[0]).toHaveTextContent('3');
    expect(counts[1]).toHaveTextContent('1');
  });

  it('lists every occurrence time in the Count tooltip', async () => {
    render(<AlertTable alerts={[alerts[0]!]} onAlertTimeClick={jest.fn()} timeZone="utc" />);
    fireEvent.mouseEnter(screen.getByTestId('alert-count'));
    const list = await screen.findByTestId('alert-occurrences');
    expect(list).toHaveTextContent(localTime(1717500000));
    expect(list).toHaveTextContent(localTime(1717500600));
    expect(list).toHaveTextContent(localTime(1717501200));
  });

  it('calls onAlertTimeClick with the LAST (max) occurrence time in seconds when Last occurred is clicked', () => {
    const onAlertTimeClick = jest.fn();
    render(<AlertTable alerts={alerts} onAlertTimeClick={onAlertTimeClick} timeZone="utc" />);
    const times = screen.getAllByTestId('alert-time');
    fireEvent.click(times[0]!);
    expect(onAlertTimeClick).toHaveBeenCalledWith(1717501200); // max of [1717500000, 1717500600, 1717501200]
    fireEvent.click(times[1]!);
    expect(onAlertTimeClick).toHaveBeenCalledWith(1717500300); // single occurrence
  });

  it('renders "No alerts" when the list is empty', () => {
    render(<AlertTable alerts={[]} onAlertTimeClick={jest.fn()} timeZone="utc" />);
    expect(screen.getByTestId('alert-table-empty')).toHaveTextContent('No alerts');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('formats the Last occurred label (max occurrence) with the provided time zone', () => {
    render(<AlertTable alerts={[alerts[0]!]} onAlertTimeClick={jest.fn()} timeZone="utc" />);
    // max = 1717501200s = 2024-06-04 11:40:00 UTC
    expect(screen.getByTestId('alert-time')).toHaveTextContent(localTime(1717501200));
  });
});
