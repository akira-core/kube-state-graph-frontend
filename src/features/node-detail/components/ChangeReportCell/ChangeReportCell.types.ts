import type { DetailLookup } from '../../hooks/useNodeDetailUrls';

export interface ChangeReportCellProps {
  // The eager-prefetched lookup state to render (loading / ready{url} / unavailable).
  state: DetailLookup;
  // Prefix for the cell's data-testids — `application` (ApplicationTable, single row)
  // or `container` (ContainerTable, one per row): `${idPrefix}-url-pending|link|unavailable`.
  idPrefix: 'application' | 'container';
}
