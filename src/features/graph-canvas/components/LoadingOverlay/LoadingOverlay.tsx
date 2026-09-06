import React from 'react';

import { SpinnerIcon } from '../../../../shared/ui/icons';

export function LoadingOverlay(): React.JSX.Element {
  return (
    <output
      data-testid="loading-overlay"
      aria-live="polite"
      className="flex h-full w-full items-center justify-center gap-2 text-[13px] text-secondary"
    >
      <SpinnerIcon size={15} />
      Loading graph…
    </output>
  );
}
