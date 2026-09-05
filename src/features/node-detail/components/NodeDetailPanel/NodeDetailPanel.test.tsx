import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import { NodeDetailPanel } from './NodeDetailPanel';
import type { NodeDetailData } from './NodeDetailPanel.types';

const sample: NodeDetailData = {
  id: 'p1',
  label: 'mongo-0',
  kind: 'pod',
  status: 'critical',
  attributes: [
    { key: 'kind', value: 'pod' },
    { key: 'namespace', value: 'prod' },
  ],
  alerts: [{ pod: 'mongo-1', service: 'mongo', name: 'HighMemory', severity: 'critical', timeRecords: [1717500000] }],
};

describe('NodeDetailPanel', () => {
  it('renders nothing when node is null', () => {
    render(<NodeDetailPanel node={null} onClose={jest.fn()} onAlertTimeClick={jest.fn()} />);
    expect(screen.queryByTestId('node-detail-panel')).not.toBeInTheDocument();
  });

  it('renders title, kind/status badges and the alerts table', () => {
    render(<NodeDetailPanel node={sample} onClose={jest.fn()} onAlertTimeClick={jest.fn()} timeZone="utc" />);
    expect(screen.getByTestId('node-detail-panel')).toBeInTheDocument();
    expect(screen.getByText('mongo-0')).toBeInTheDocument();
    expect(screen.getByTestId('node-detail-kind')).toHaveTextContent('pod');
    expect(screen.getByTestId('node-detail-status')).toHaveTextContent('critical');
    expect(screen.getByText('Alerts')).toBeInTheDocument();
    expect(screen.getByTestId('node-detail-section-alerts')).toBeInTheDocument();
    expect(screen.getByText('HighMemory')).toBeInTheDocument();
  });

  describe('always renders (Properties removed; header is the minimum)', () => {
    it('renders a header-only panel for a bare detail-eligible node (no app/containers/alerts/dashboard)', () => {
      // Attributes live in the pinned tooltip; the bottom panel still renders its header.
      const sc: NodeDetailData = {
        id: 'sc',
        label: 'fast-ssd',
        kind: 'storageclass',
        attributes: [
          { key: 'kind', value: 'storageclass' },
          { key: 'provisioner', value: 'rook-ceph.rbd.csi.ceph.com' },
        ],
      };
      render(<NodeDetailPanel node={sc} onClose={jest.fn()} onAlertTimeClick={jest.fn()} />);
      expect(screen.getByTestId('node-detail-panel')).toBeInTheDocument();
      expect(screen.getByText('fast-ssd')).toBeInTheDocument();
      expect(screen.getByLabelText('Close detail panel')).toBeInTheDocument();
      // No body sections.
      expect(screen.queryByTestId('node-detail-section-application')).not.toBeInTheDocument();
      expect(screen.queryByTestId('node-detail-section-containers')).not.toBeInTheDocument();
      expect(screen.queryByTestId('node-detail-section-alerts')).not.toBeInTheDocument();
    });

    it('never renders the removed Properties section, even for a node with sections', () => {
      render(<NodeDetailPanel node={sample} onClose={jest.fn()} onAlertTimeClick={jest.fn()} />);
      expect(screen.queryByTestId('node-detail-section-properties')).not.toBeInTheDocument();
      expect(screen.queryByTestId('node-detail-prop-namespace')).not.toBeInTheDocument();
    });

    it('shows the Dashboard button in the header for a content-less node when the backend has a URL', () => {
      const svc: NodeDetailData = {
        id: 'service/mongo-svc',
        label: 'mongo-svc',
        kind: 'service',
        attributes: [{ key: 'kind', value: 'service' }],
      };
      render(
        <NodeDetailPanel
          node={svc}
          onClose={jest.fn()}
          onAlertTimeClick={jest.fn()}
          dashboard={{ status: 'ready', urls: [{ label: 'Dashboard', url: 'https://dash/svc' }] }}
        />
      );
      expect(screen.getByTestId('node-detail-dashboard-button')).toHaveAttribute('href', 'https://dash/svc');
      expect(screen.queryByTestId('node-detail-section-application')).not.toBeInTheDocument();
    });
  });

  describe('Alerts section (data-gated)', () => {
    it('does not render the Alerts section (nor a "No alerts" message) when the node carries none', () => {
      const noAlerts: NodeDetailData = {
        id: 'p2',
        label: 'web',
        kind: 'pod',
        attributes: [{ key: 'kind', value: 'pod' }],
      };
      render(<NodeDetailPanel node={noAlerts} onClose={jest.fn()} onAlertTimeClick={jest.fn()} />);
      expect(screen.queryByTestId('node-detail-section-alerts')).not.toBeInTheDocument();
      expect(screen.queryByText('No alerts')).not.toBeInTheDocument();
    });

    it('does not render the Alerts section for an empty alerts array', () => {
      const emptyAlerts: NodeDetailData = { id: 'p3', label: 'web', kind: 'pod', alerts: [] };
      render(<NodeDetailPanel node={emptyAlerts} onClose={jest.fn()} onAlertTimeClick={jest.fn()} />);
      expect(screen.queryByTestId('node-detail-section-alerts')).not.toBeInTheDocument();
    });

    it('forwards alert time clicks to onAlertTimeClick (seconds)', () => {
      const onAlertTimeClick = jest.fn();
      render(<NodeDetailPanel node={sample} onClose={jest.fn()} onAlertTimeClick={onAlertTimeClick} timeZone="utc" />);
      fireEvent.click(screen.getByTestId('alert-time'));
      expect(onAlertTimeClick).toHaveBeenCalledWith(1717500000);
    });

    it('keeps the header but drops the Alerts section when re-rendered for a content-less node', () => {
      const { rerender } = render(
        <NodeDetailPanel node={sample} onClose={jest.fn()} onAlertTimeClick={jest.fn()} timeZone="utc" />
      );
      expect(screen.getByText('HighMemory')).toBeInTheDocument();

      // A content-less node (no app/containers/alerts/dashboard) still renders its header —
      // the panel always renders; only the body sections are data-gated.
      const other: NodeDetailData = {
        id: 'p9',
        label: 'web-1',
        kind: 'pod',
        attributes: [{ key: 'kind', value: 'pod' }],
      };
      rerender(<NodeDetailPanel node={other} onClose={jest.fn()} onAlertTimeClick={jest.fn()} timeZone="utc" />);
      expect(screen.getByTestId('node-detail-panel')).toBeInTheDocument();
      expect(screen.getByText('web-1')).toBeInTheDocument();
      expect(screen.queryByText('HighMemory')).not.toBeInTheDocument();
      expect(screen.queryByTestId('node-detail-section-alerts')).not.toBeInTheDocument();
    });
  });

  it('keeps the header (and its close button) outside the scrollable body so it stays pinned', () => {
    render(<NodeDetailPanel node={sample} onClose={jest.fn()} onAlertTimeClick={jest.fn()} timeZone="utc" />);
    const scrollBody = screen.getByTestId('node-detail-scroll');
    expect(scrollBody).toContainElement(screen.getByTestId('node-detail-section-alerts'));
    expect(scrollBody).not.toContainElement(screen.getByLabelText('Close detail panel'));
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = jest.fn();
    render(<NodeDetailPanel node={sample} onClose={onClose} onAlertTimeClick={jest.fn()} />);
    fireEvent.click(screen.getByLabelText('Close detail panel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe('Dashboard button (header)', () => {
    const ready = {
      status: 'ready',
      urls: [{ label: 'Dashboard', url: 'https://dash/n1' }],
    } as const;

    it('renders the Dashboard button beside the name when ready', () => {
      render(<NodeDetailPanel node={sample} onClose={jest.fn()} onAlertTimeClick={jest.fn()} dashboard={ready} />);
      const btn = screen.getByTestId('node-detail-dashboard-button');
      expect(btn).toHaveAttribute('href', 'https://dash/n1');
      expect(btn).toHaveAttribute('target', '_blank');
      expect(btn).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('renders no button when dashboard is omitted, loading, or unavailable', () => {
      const { rerender } = render(<NodeDetailPanel node={sample} onClose={jest.fn()} onAlertTimeClick={jest.fn()} />);
      expect(screen.queryByTestId('node-detail-dashboard-button')).not.toBeInTheDocument();
      rerender(
        <NodeDetailPanel
          node={sample}
          onClose={jest.fn()}
          onAlertTimeClick={jest.fn()}
          dashboard={{ status: 'loading' }}
        />
      );
      expect(screen.queryByTestId('node-detail-dashboard-button')).not.toBeInTheDocument();
      rerender(
        <NodeDetailPanel
          node={sample}
          onClose={jest.fn()}
          onAlertTimeClick={jest.fn()}
          dashboard={{ status: 'unavailable' }}
        />
      );
      expect(screen.queryByTestId('node-detail-dashboard-button')).not.toBeInTheDocument();
    });
  });

  describe('Application / Containers change-report sections', () => {
    const podWithBoth: NodeDetailData = {
      id: 'p1',
      label: 'mongo-0',
      kind: 'pod',
      application: 'checkout',
      containers: [{ name: 'app', image: 'repo/app:1.2' }],
    };

    it('renders both sections for a pod carrying application and containers (valid lookups)', () => {
      render(
        <NodeDetailPanel
          node={podWithBoth}
          onClose={jest.fn()}
          onAlertTimeClick={jest.fn()}
          lookups={{
            enabled: true,
            application: { status: 'ready', url: 'https://app.example/checkout' },
            containers: { phase: 'settled', byName: { app: { status: 'ready', url: 'https://img.example/app' } } },
          }}
        />
      );
      expect(screen.getByTestId('node-detail-section-application')).toBeInTheDocument();
      expect(screen.getByTestId('node-detail-section-containers')).toBeInTheDocument();
      expect(screen.getByText('checkout')).toBeInTheDocument();
      expect(screen.getByText('app')).toBeInTheDocument();
      expect(screen.getByText('repo/app:1.2')).toBeInTheDocument();
    });

    it('renders both sections for a controller kind (statefulset)', () => {
      render(
        <NodeDetailPanel
          node={{ ...podWithBoth, kind: 'statefulset' }}
          onClose={jest.fn()}
          onAlertTimeClick={jest.fn()}
        />
      );
      expect(screen.getByTestId('node-detail-section-application')).toBeInTheDocument();
      expect(screen.getByTestId('node-detail-section-containers')).toBeInTheDocument();
    });

    it('renders the Application section (not Containers) for a non-workload node that belongs to an application', () => {
      // A service / pvc in an ArgoCD app shows its Application change-report (config_changes),
      // but never the Containers section (no containers, even if data strays in).
      render(
        <NodeDetailPanel node={{ ...podWithBoth, kind: 'service' }} onClose={jest.fn()} onAlertTimeClick={jest.fn()} />
      );
      expect(screen.getByTestId('node-detail-section-application')).toBeInTheDocument();
      expect(screen.queryByTestId('node-detail-section-containers')).not.toBeInTheDocument();
    });

    it('renders no change-report sections for a non-workload node WITHOUT an application', () => {
      render(
        <NodeDetailPanel
          node={{ id: 's', label: 'svc', kind: 'service' }}
          onClose={jest.fn()}
          onAlertTimeClick={jest.fn()}
        />
      );
      expect(screen.queryByTestId('node-detail-section-application')).not.toBeInTheDocument();
      expect(screen.queryByTestId('node-detail-section-containers')).not.toBeInTheDocument();
    });

    it('hides only the Application section when application is absent (independent gating)', () => {
      const noApp: NodeDetailData = {
        id: 'p1',
        label: 'mongo-0',
        kind: 'pod',
        containers: [{ name: 'app', image: 'repo/app:1.2' }],
      };
      render(<NodeDetailPanel node={noApp} onClose={jest.fn()} onAlertTimeClick={jest.fn()} />);
      expect(screen.queryByTestId('node-detail-section-application')).not.toBeInTheDocument();
      expect(screen.getByTestId('node-detail-section-containers')).toBeInTheDocument();
    });

    it('hides only the Containers section when containers are absent or empty', () => {
      const noContainers: NodeDetailData = { id: 'p1', label: 'mongo-0', kind: 'pod', application: 'checkout' };
      const { rerender } = render(
        <NodeDetailPanel node={noContainers} onClose={jest.fn()} onAlertTimeClick={jest.fn()} />
      );
      expect(screen.getByTestId('node-detail-section-application')).toBeInTheDocument();
      expect(screen.queryByTestId('node-detail-section-containers')).not.toBeInTheDocument();
      rerender(
        <NodeDetailPanel node={{ ...podWithBoth, containers: [] }} onClose={jest.fn()} onAlertTimeClick={jest.fn()} />
      );
      expect(screen.queryByTestId('node-detail-section-containers')).not.toBeInTheDocument();
    });

    it('shows change-report AND the alerts table together on the same node (single unified panel)', () => {
      render(
        <NodeDetailPanel
          node={{ ...podWithBoth, alerts: sample.alerts ?? [] }}
          onClose={jest.fn()}
          onAlertTimeClick={jest.fn()}
          lookups={{
            enabled: true,
            application: { status: 'unavailable', error: 'app lookup failed' },
            containers: { phase: 'settled', byName: {} },
          }}
        />
      );
      expect(screen.getByTestId('application-url-unavailable')).toBeInTheDocument();
      expect(screen.getByTestId('container-url-unavailable')).toBeInTheDocument();
      expect(screen.getByTestId('application-url-unavailable')).toHaveAttribute('title', 'app lookup failed');
      expect(screen.getByText('mongo-0')).toBeInTheDocument();
      // Both change-report and the Alerts table coexist now (no view split).
      expect(screen.getByTestId('node-detail-section-alerts')).toBeInTheDocument();
      expect(screen.getByText('HighMemory')).toBeInTheDocument();
    });

    it('threads resolved lookup state down: sections render real anchors with the prefetched URLs', () => {
      render(
        <NodeDetailPanel
          node={podWithBoth}
          onClose={jest.fn()}
          onAlertTimeClick={jest.fn()}
          lookups={{
            enabled: true,
            application: { status: 'ready', url: 'u1' },
            containers: { phase: 'settled', byName: { app: { status: 'ready', url: 'u2' } } },
          }}
        />
      );
      const appLink = screen.getByTestId('application-url-link');
      expect(appLink).toHaveAttribute('href', 'u1');
      expect(appLink).toHaveAttribute('target', '_blank');
      expect(appLink).toHaveAttribute('rel', 'noopener noreferrer');

      const containerLink = screen.getByTestId('container-url-link');
      expect(containerLink).toHaveAttribute('href', 'u2');
    });

    it('shows the muted "Not found" hint and no links when lookups is omitted (idle default)', () => {
      render(<NodeDetailPanel node={podWithBoth} onClose={jest.fn()} onAlertTimeClick={jest.fn()} />);
      expect(screen.getByTestId('application-url-unavailable')).toBeInTheDocument();
      expect(screen.getByTestId('container-url-unavailable')).toBeInTheDocument();
      expect(screen.queryByTestId('application-url-link')).not.toBeInTheDocument();
      expect(screen.queryByTestId('container-url-link')).not.toBeInTheDocument();
    });

    it('forwards timeZone to both tables: Current / Previous render the diff timestamps (ISO in title)', () => {
      render(
        <NodeDetailPanel
          node={podWithBoth}
          onClose={jest.fn()}
          onAlertTimeClick={jest.fn()}
          timeZone="utc"
          lookups={{
            enabled: true,
            application: {
              status: 'ready',
              url: 'u1',
              currentTime: '2026-06-16T10:30:00Z',
              previousTime: '2026-06-10T08:00:00Z',
            },
            containers: {
              phase: 'settled',
              byName: { app: { status: 'ready', url: 'u2', currentTime: '2026-06-16T10:30:00Z' } },
            },
          }}
        />
      );
      expect(screen.getByTestId('application-current').textContent).toContain('2026-06-16');
      expect(screen.getByTestId('application-current').getAttribute('title')).toBe('2026-06-16T10:30:00Z');
      expect(screen.getByTestId('application-previous').getAttribute('title')).toBe('2026-06-10T08:00:00Z');
      expect(screen.getByTestId('container-current').textContent).toContain('2026-06-16');
      expect(screen.getByTestId('container-current').getAttribute('title')).toBe('2026-06-16T10:30:00Z');
    });

    it('renders muted "n/a" time cells (no crash) when the ready lookups carry no timestamps', () => {
      render(
        <NodeDetailPanel
          node={podWithBoth}
          onClose={jest.fn()}
          onAlertTimeClick={jest.fn()}
          lookups={{
            enabled: true,
            application: { status: 'ready', url: 'u1' },
            containers: { phase: 'settled', byName: { app: { status: 'ready', url: 'u2' } } },
          }}
        />
      );
      expect(screen.getByTestId('application-current').textContent).toBe('n/a');
      expect(screen.getByTestId('container-current').textContent).toBe('n/a');
    });
  });

  describe('layout: single scroll authority (overlap/no-scroll regression)', () => {
    // A node with BOTH containers AND alerts is the exact repro: the unified panel renders
    // the Containers and Alerts sections together. They MUST stack as content-height blocks
    // under ONE scroll container (the body), not two competing internal-scroll fill regions.
    const podWithBoth: NodeDetailData = {
      id: 'p1',
      label: 'mongo-0',
      kind: 'pod',
      application: 'checkout',
      containers: [{ name: 'app', image: 'repo/app:1.2' }],
      alerts: sample.alerts ?? [],
    };

    it('routes all overflow to the body: Containers + Alerts are content-height with no nested scroller', () => {
      render(<NodeDetailPanel node={podWithBoth} onClose={jest.fn()} onAlertTimeClick={jest.fn()} timeZone="utc" />);

      const body = screen.getByTestId('node-detail-scroll');
      const containers = screen.getByTestId('node-detail-section-containers');
      const alerts = screen.getByTestId('node-detail-section-alerts');

      // Both repro sections coexist as direct children of the one scroll body.
      expect(body).toContainElement(containers);
      expect(body).toContainElement(alerts);

      // (1) The body is THE scroller (pre-fix: overflow:'hidden' → overflowY unset → FAILS).
      expect(body).toHaveStyle({ overflowY: 'auto' });

      // (2) The two big sections are content-height, not competing fills (pre-fix: flexGrow 1 → FAILS).
      expect(containers).toHaveStyle({ flexGrow: '0' });
      expect(alerts).toHaveStyle({ flexGrow: '0' });

      // (3) No nested vertical scroller: each section's table wrapper (the slot = its last child,
      // after the sectionTitle) MUST NOT own its own overflowY:auto (pre-fix: both → 'auto' → FAILS).
      const containersSlot = containers.lastElementChild as HTMLElement;
      const alertsSlot = alerts.lastElementChild as HTMLElement;
      expect(getComputedStyle(containersSlot).overflowY).not.toBe('auto');
      expect(getComputedStyle(alertsSlot).overflowY).not.toBe('auto');
    });
  });
});
