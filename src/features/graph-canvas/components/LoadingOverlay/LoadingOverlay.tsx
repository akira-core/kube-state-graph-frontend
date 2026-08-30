import React from 'react';

export function LoadingOverlay(): React.JSX.Element {
  return (
    <output data-testid="loading-overlay" aria-live="polite">
      Loading graph…
    </output>
  );
}
