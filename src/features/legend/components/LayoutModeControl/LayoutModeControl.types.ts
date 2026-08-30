import type { ReactNode } from 'react';

import type { PodParentMode } from '../../../../shared/constants/types';

export interface LayoutModeControlProps {
  mode: PodParentMode;
  onChange: (mode: PodParentMode) => void;
  // Optional control rendered at the right end of the "Layout" label row — lets the
  // panel place its legend-collapse button there instead of in a dedicated header row.
  action?: ReactNode;
  // Sibling layout controls that belong under the same "Layout" heading (the algorithm
  // picker). Kept in one group so the rail spends one header, not two, on one decision.
  children?: ReactNode;
}
