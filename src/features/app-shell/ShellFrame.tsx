import { createContext, useContext, type ReactNode } from 'react';

import type { RuntimeConfig } from '../runtime-config';

import type { useViewTimeRange } from './useViewTimeRange';

export interface PageStatus {
  lastLoadedAt: number | null;
  refreshing: boolean;
  error: string | undefined;
  reload: () => void;
  reloadDisabled: boolean;
}

export const IDLE_PAGE_STATUS: PageStatus = {
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
