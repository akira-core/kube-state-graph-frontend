import type { JSX } from 'react';

import { STATUS_COLOR } from '../../../../shared/constants/colorByStatus';
import { CloseIcon } from '../../../../shared/ui/icons';
import { DETAIL_URL_KINDS } from '../../detailUrlKinds';
import { IDLE_NODE_DETAIL_LOOKUPS } from '../../hooks/useNodeDetailUrls';
import { AlertTable } from '../AlertTable';
import { ApplicationTable } from '../ApplicationTable';
import { ContainerTable } from '../ContainerTable';
import { DashboardButton } from '../DashboardButton';

import type { NodeDetailPanelProps } from './NodeDetailPanel.types';

export function NodeDetailPanel({
  node,
  onClose,
  onAlertTimeClick,
  lookups,
  dashboard,
}: Readonly<NodeDetailPanelProps>): JSX.Element | null {
  if (node === null) {
    return null;
  }
  const lookupsState = lookups ?? IDLE_NODE_DETAIL_LOOKUPS;
  const isDetailUrlKind = node.kind !== undefined && DETAIL_URL_KINDS.has(node.kind);
  const showApplication = node.application !== undefined;
  const showContainers = isDetailUrlKind && node.containers !== undefined && node.containers.length > 0;
  const alerts = node.alerts ?? [];
  const showAlerts = alerts.length > 0;
  return (
    <div
      className="absolute bottom-2 left-2 right-2 z-[1000] flex max-h-[50%] flex-col overflow-hidden rounded border border-weak bg-surface p-2.5 text-primary shadow"
      data-testid="node-detail-panel"
    >
      <div className="mb-2.5 flex items-center gap-2 border-b-2 border-strong pb-2.5">
        <span className="font-semibold">{node.label}</span>
        {dashboard !== undefined && <DashboardButton state={dashboard} />}
        <span className="flex items-center gap-1">
          {node.kind !== undefined && (
            <span className="rounded bg-[var(--ksg-border-weak)] px-1.5 py-0.5 text-xs" data-testid="node-detail-kind">
              {node.kind}
            </span>
          )}
          {node.status !== undefined && (
            <span
              className="rounded px-1.5 py-0.5 text-xs text-black"
              data-testid="node-detail-status"
              style={{ backgroundColor: STATUS_COLOR[node.status] }}
            >
              {node.status}
            </span>
          )}
        </span>
        <button
          type="button"
          className="ml-auto rounded p-1"
          aria-label="Close detail panel"
          title="Close detail panel"
          onClick={onClose}
        >
          <CloseIcon size={16} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" style={{ overflowY: 'auto' }} data-testid="node-detail-scroll">
        {showApplication && node.application !== undefined && (
          <div className="mb-3" style={{ flexGrow: 0 }} data-testid="node-detail-section-application">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-secondary">Application</div>
            <ApplicationTable application={node.application} state={lookupsState.application} />
          </div>
        )}
        {showContainers && node.containers !== undefined && (
          <div className="mb-3" style={{ flexGrow: 0 }} data-testid="node-detail-section-containers">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-secondary">Containers</div>
            <ContainerTable containers={node.containers} lookups={lookupsState.containers} />
          </div>
        )}
        {showAlerts && (
          <div style={{ flexGrow: 0 }} data-testid="node-detail-section-alerts">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-secondary">Alerts</div>
            <AlertTable alerts={alerts} onAlertTimeClick={onAlertTimeClick} />
          </div>
        )}
      </div>
    </div>
  );
}
