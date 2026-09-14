import { createContext, useContext, type ReactNode } from 'react';

import type { RuntimeConfig } from '../runtime-config';

import type { useViewTimeRange } from './useViewTimeRange';

export type PagePhase = 'awaiting' | 'loading' | 'ready' | 'error' | 'cancelled';

export interface PageStatus {
  phase: PagePhase;
  lastLoadedAt: number | null;
  refreshing: boolean;
  error: string | undefined;
  reload: () => void;
  reloadDisabled: boolean;
}

export function phaseOf(state: { status: string; refreshing: boolean; cancelled: boolean }): PagePhase {
  if (state.cancelled) {
    return 'cancelled';
  }
  if (state.status === 'loading' || state.refreshing) {
    return 'loading';
  }
  if (state.status === 'error') {
    return 'error';
  }
  if (state.status === 'ready') {
    return 'ready';
  }
  return 'awaiting';
}

export const IDLE_PAGE_STATUS: PageStatus = {
  phase: 'awaiting',
  lastLoadedAt: null,
  refreshing: false,
  error: undefined,
  reload: () => undefined,
  reloadDisabled: true,
};

export interface ShellFrameValue {
  config: RuntimeConfig;
  time: ReturnType<typeof useViewTimeRange>;
  status: PageStatus;
  setStatus: (status: PageStatus) => void;
  focusMode: boolean;
  setFocusMode: (next: boolean) => void;
}

const ShellFrameContext = createContext<ShellFrameValue | null>(null);

export function ShellFrameProvider({
  value,
  children,
}: Readonly<{ value: ShellFrameValue; children: ReactNode }>): ReactNode {
  return <ShellFrameContext.Provider value={value}>{children}</ShellFrameContext.Provider>;
}

export function useShellFrame(): ShellFrameValue {
  const value = useContext(ShellFrameContext);
  if (value === null) {
    throw new Error('useShellFrame must be used under ShellFrameProvider');
  }
  return value;
}
