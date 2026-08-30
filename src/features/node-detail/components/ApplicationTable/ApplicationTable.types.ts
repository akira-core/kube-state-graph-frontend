import type { DetailLookup } from '../../hooks/useNodeDetailUrls';

export interface ApplicationTableProps {
  // ArgoCD application name (pod passthrough / controller aggregate). One row
  // today; the row rendering is list-shaped so the table can grow to several.
  application: string;
  // Eager-prefetched Change Report state for the (single) application: loading
  // (spinner) → ready (a real <a href> anchor, URL pre-resolved) / unavailable
  // (muted "Not found" hint, full error in title). No click trigger.
  state: DetailLookup;
  // Panel timeZone, forwarded to formatChangeTime for the Current / Previous diff
  // timestamp columns (omitted → Grafana's default zone).
  timeZone?: string;
}
