import type { JSX } from 'react';

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
      <h1 className="text-xl font-semibold">Configuration error</h1>
      <p className="mt-3 max-w-xl text-center text-secondary">
        Could not load <code className="text-primary">{path}</code>: {problem}
      </p>
      <button
        type="button"
        className="mt-6 rounded bg-[var(--ksg-accent-primary)] px-4 py-2 text-sm text-inverse"
        onClick={onRetry}
      >
        Retry
      </button>
    </div>
  );
}
