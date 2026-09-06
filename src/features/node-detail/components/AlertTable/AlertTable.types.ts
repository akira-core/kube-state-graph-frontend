import type { NodeAlert } from '../../../../shared/constants/types';

export interface AlertTableProps {
  alerts: NodeAlert[];
  // Called with the clicked alert's time (Unix SECONDS).
  onAlertTimeClick: (timeSec: number) => void;
  timeZone?: string; // forwarded to dateTimeFormat for the Time column
}
