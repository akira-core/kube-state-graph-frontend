import { useCallback, useEffect, useRef, useState, type JSX } from 'react';

import { AppShell } from '../features/app-shell/AppShell';
import {
  ConfigErrorScreen,
  loadRuntimeConfig,
  type LoadConfigResult,
  type RuntimeConfig,
} from '../features/runtime-config';
import { ThemeProvider } from '../features/theme';

type Phase =
  { kind: 'loading' } | { kind: 'error'; path: string; problem: string } | { kind: 'ready'; config: RuntimeConfig };

export function App(): JSX.Element {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [nonce, setNonce] = useState(0);

  // Generation guard: a Retry (or a StrictMode double-mount) starts a second load while
  // the first is still in flight. Without it, the slower attempt's result wins — a hung
  // first fetch that finally rejects would tear down the already-mounted app and replace
  // it with the configuration-error screen.
  const generationRef = useRef(0);

  const load = useCallback(async () => {
    generationRef.current += 1;
    const generation = generationRef.current;
    setPhase({ kind: 'loading' });
    const result: LoadConfigResult = await loadRuntimeConfig();
    if (generation !== generationRef.current) {
      return;
    }
    if (result.ok) {
      setPhase({ kind: 'ready', config: result.config });
    } else {
      setPhase({ kind: 'error', path: result.path, problem: result.problem });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, nonce]);

  if (phase.kind === 'loading') {
    return (
      <ThemeProvider>
        <div
          className="flex min-h-screen items-center justify-center bg-canvas text-secondary"
          data-testid="config-loading"
        >
          Loading configuration…
        </div>
      </ThemeProvider>
    );
  }
  if (phase.kind === 'error') {
    return (
      <ThemeProvider>
        <ConfigErrorScreen path={phase.path} problem={phase.problem} onRetry={() => setNonce((n) => n + 1)} />
      </ThemeProvider>
    );
  }
  return (
    <ThemeProvider configTheme={phase.config.theme}>
      <AppShell config={phase.config} />
    </ThemeProvider>
  );
}
