import type { JSX } from 'react';

import { STATUS_COLOR } from '../../../../shared/constants/colorByStatus';
import { Badge } from '../../../../shared/ui/Badge';
import { Button } from '../../../../shared/ui/Button';
import { CloseIcon } from '../../../../shared/ui/icons';
import { eyebrowClass } from '../../../../shared/ui/Section';
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
      className="absolute bottom-2 left-2 right-2 z-[1000] flex max-h-[50%] flex-col overflow-hidden rounded-lg border border-hairline bg-surface text-primary shadow-panel"
      data-testid="node-detail-panel"
    >
      <div className="flex items-center gap-2 border-b border-hairline px-3 py-2">
        <span className="truncate font-mono text-[13px] font-semibold">{node.label}</span>
        {node.kind !== undefined && (
          <Badge size="xs" data-testid="node-detail-kind">
            {node.kind}
          </Badge>
        )}
        {node.status !== undefined && (
          <span
            className="inline-flex items-center gap-1.5 rounded border border-hairline px-1.5 py-1 text-[10px] font-semibold uppercase leading-none tracking-eyebrow"
            data-testid="node-detail-status"
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: STATUS_COLOR[node.status] }}
              aria-hidden
            />
            {node.status}
          </span>
        )}
        {dashboard !== undefined && <DashboardButton state={dashboard} />}
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto"
          aria-label="Close detail panel"
          title="Close detail panel"
          onClick={onClose}
        >
          <CloseIcon size={14} />
        </Button>
      </div>
      <div
        className="ksg-scroll min-h-0 flex-1 overflow-y-auto px-3 py-2.5"
        style={{ overflowY: 'auto' }}
        data-testid="node-detail-scroll"
      >
        {showApplication && node.application !== undefined && (
          <div className="mb-3" style={{ flexGrow: 0 }} data-testid="node-detail-section-application">
            <div className={`mb-1.5 ${eyebrowClass}`}>Application</div>
            <ApplicationTable application={node.application} state={lookupsState.application} />
          </div>
        )}
        {showContainers && node.containers !== undefined && (
          <div className="mb-3" style={{ flexGrow: 0 }} data-testid="node-detail-section-containers">
            <div className={`mb-1.5 ${eyebrowClass}`}>Containers</div>
            <ContainerTable containers={node.containers} lookups={lookupsState.containers} />
          </div>
        )}
        {showAlerts && (
          <div style={{ flexGrow: 0 }} data-testid="node-detail-section-alerts">
            <div className={`mb-1.5 ${eyebrowClass}`}>Alerts</div>
            <AlertTable alerts={alerts} onAlertTimeClick={onAlertTimeClick} />
          </div>
        )}
      </div>
    </div>
  );
}
