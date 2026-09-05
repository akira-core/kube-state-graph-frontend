import type { DashboardLookup } from '../../hooks/useNodeDashboardUrl';

export interface DashboardButtonProps {
  // The eager-prefetched Dashboard URL lookup. Renders ONLY when 'ready' (200 + ≥1 link).
  state: DashboardLookup;
}
