import type { JSX } from 'react';

import { Button } from '../../shared/ui/Button';
import { GraphMarkIcon } from '../../shared/ui/icons';

export interface ConfigErrorScreenProps {
  path: string;
  problem: string;
  onRetry: () => void;
}

export function ConfigErrorScreen({ path, problem, onRetry }: Readonly<ConfigErrorScreenProps>): JSX.Element {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 text-primary"
      role="alert"
      data-testid="config-error-screen"
    >
      <div className="w-full max-w-md rounded-lg border border-hairline bg-surface p-6 shadow-panel">
        <span className="flex items-center gap-2 text-secondary">
          <GraphMarkIcon size={16} />
          <span className="text-[10px] font-semibold uppercase tracking-eyebrow">Kube State Graph</span>
        </span>
        <h1 className="mt-4 text-lg font-semibold">Configuration error</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-secondary">
          Could not load <code className="font-mono text-primary">{path}</code>.
        </p>
        <p className="mt-2 rounded-md border border-hairline bg-canvas p-2.5 font-mono text-[11px] leading-relaxed text-primary">
          {problem}
        </p>
        <Button variant="primary" size="lg" className="mt-5 w-full" onClick={onRetry}>
          Retry
        </Button>
      </div>
    </div>
  );
}
