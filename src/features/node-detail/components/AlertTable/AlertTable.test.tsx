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

  // kube-state-graph's alert overlay reports no occurrence history at all. Both derived
  // cells have to degrade rather than invent a 0 count and an epoch-zero date.
  describe('an alert with no occurrence history', () => {
    const timeless: NodeAlert = { pod: 'ontap-lab-02', name: 'NetAppControllerDegraded', severity: 'critical' };

    it('still renders the row, with its name and severity', () => {
      render(<AlertTable alerts={[timeless]} onAlertTimeClick={jest.fn()} timeZone="utc" />);
      expect(screen.getByText('NetAppControllerDegraded')).toBeInTheDocument();
      expect(screen.getByTestId('alert-severity')).toHaveTextContent('critical');
    });

    it('shows n/a for Count and Last occurred instead of a fabricated 0 and epoch date', () => {
      render(<AlertTable alerts={[timeless]} onAlertTimeClick={jest.fn()} timeZone="utc" />);
      expect(screen.queryByTestId('alert-count')).not.toBeInTheDocument();
      expect(screen.queryByTestId('alert-time')).not.toBeInTheDocument();
      // service + Count + Last occurred; pod is present on this fixture.
      expect(screen.getAllByText('n/a')).toHaveLength(3);
    });

    it('offers no time-rewind target — there is no instant to rewind to', () => {
      const onAlertTimeClick = jest.fn();
      render(<AlertTable alerts={[timeless]} onAlertTimeClick={onAlertTimeClick} timeZone="utc" />);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      expect(onAlertTimeClick).not.toHaveBeenCalled();
    });

    it('degrades only its own row when mixed with timed alerts', () => {
      render(<AlertTable alerts={[alerts[0]!, timeless]} onAlertTimeClick={jest.fn()} timeZone="utc" />);
      expect(screen.getAllByTestId('alert-count')).toHaveLength(1);
      expect(screen.getAllByTestId('alert-time')).toHaveLength(1);
      expect(screen.getByTestId('alert-time')).toHaveTextContent(localTime(1717501200));
    });
  });

  // A rule that declares no severity label produces an entry without one. Absent is not an
  // unrecognised label: a custom label still earns the fallback-coloured badge, but a grade
  // nobody assigned gets the placeholder.
  describe('an alert with no severity', () => {
    const ungraded: NodeAlert = {
      pod: 'ontap-lab-02',
      service: 'ontap',
      name: 'Ungraded',
      timeRecords: [1717500300],
    };

    it('still renders the row with its name and occurrence data', () => {
      render(<AlertTable alerts={[ungraded]} onAlertTimeClick={jest.fn()} timeZone="utc" />);
      expect(screen.getByText('Ungraded')).toBeInTheDocument();
      expect(screen.getByTestId('alert-count')).toHaveTextContent('1');
      expect(screen.getByTestId('alert-time')).toHaveTextContent(localTime(1717500300));
    });

    it('shows n/a instead of a badge asserting a severity nobody assigned', () => {
      render(<AlertTable alerts={[ungraded]} onAlertTimeClick={jest.fn()} timeZone="utc" />);
      expect(screen.queryByTestId('alert-severity')).not.toBeInTheDocument();
      expect(screen.getAllByText('n/a')).toHaveLength(1); // severity only; pod/service present
    });

    it('still badges a custom label — unrecognised is not the same as absent', () => {
      const custom: NodeAlert = { ...ungraded, severity: 'P1' };
      render(<AlertTable alerts={[custom]} onAlertTimeClick={jest.fn()} timeZone="utc" />);
      expect(screen.getByTestId('alert-severity')).toHaveTextContent('P1');
      expect(screen.queryByText('n/a')).not.toBeInTheDocument();
    });

    it('degrades every cell the producer left unstated, all in one row', () => {
      const bare: NodeAlert = { name: 'Bare' };
      render(<AlertTable alerts={[bare]} onAlertTimeClick={jest.fn()} timeZone="utc" />);
      expect(screen.getByText('Bare')).toBeInTheDocument();
      // pod, service, severity, count, last occurred
      expect(screen.getAllByText('n/a')).toHaveLength(5);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });
});
