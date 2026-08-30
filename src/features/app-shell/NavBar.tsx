import type { JSX } from 'react';
import { NavLink } from 'react-router';

import type { RelativeWindow, ViewTimeRange } from '../../shared/time/viewTimeRange';
import { useRequiredThemeController, type ThemeChoice } from '../theme';

export interface NavBarProps {
  demoMode: boolean;
  lastLoadedAt: number | null;
  refreshing: boolean;
  error: string | undefined;
  refreshIntervalSeconds: number;
  onReload: () => void;
  viewRange: ViewTimeRange;
  onRelative: (window: RelativeWindow) => void;
  onAbsolute: (fromUnixSeconds: number, toUnixSeconds: number) => void;
}

function formatLoaded(ts: number | null): string {
  if (ts === null) {
    return 'never';
  }
  return new Date(ts).toLocaleTimeString();
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function unixToDatetimeLocal(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function datetimeLocalToUnix(value: string): number | null {
  if (value.length === 0) {
    return null;
  }
  const ms = new Date(value).getTime();
  if (Number.isNaN(ms)) {
    return null;
  }
  return Math.floor(ms / 1000);
}

export function NavBar({
  demoMode,
  lastLoadedAt,
  refreshing,
  error,
  refreshIntervalSeconds,
  onReload,
  viewRange,
  onRelative,
  onAbsolute,
}: Readonly<NavBarProps>): JSX.Element {
  const theme = useRequiredThemeController();
  return (
    <nav
      aria-label="Application"
      className="flex h-12 shrink-0 items-center gap-4 border-b border-weak bg-surface px-3 text-primary"
    >
      <span className="font-semibold">Kube State Graph</span>
      <NavLink
        to="/graph"
        className={({ isActive }) => (isActive ? 'font-semibold underline' : 'text-secondary hover:text-primary')}
      >
        Graph
      </NavLink>
      <NavLink
        to="/sankey"
        className={({ isActive }) => (isActive ? 'font-semibold underline' : 'text-secondary hover:text-primary')}
      >
        Sankey
      </NavLink>
      <label className="ml-4 text-sm">
        Theme
        <select
          className="ml-2 rounded border border-medium bg-canvas px-1 py-0.5"
          aria-label="Theme"
          value={theme.selection}
          onChange={(e) => theme.setChoice(e.target.value as ThemeChoice)}
        >
          <option value="light">light</option>
          <option value="dark">dark</option>
          <option value="system">system</option>
        </select>
      </label>
      <label className="text-sm">
        Time range
        <select
          className="ml-2 rounded border border-medium bg-canvas px-1 py-0.5"
          aria-label="View time range"
          value={viewRange.kind === 'relative' ? viewRange.window : 'custom'}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '1h' || v === '6h' || v === '24h' || v === '7d') {
              onRelative(v);
              return;
            }
            if (v === 'custom') {
              const now = Math.floor(Date.now() / 1000);
              onAbsolute(now - 24 * 3600, now);
            }
          }}
        >
          <option value="1h">1h</option>
          <option value="6h">6h</option>
          <option value="24h">24h</option>
          <option value="7d">7d</option>
          <option value="custom">custom</option>
        </select>
      </label>
      {viewRange.kind === 'absolute' && (
        <span className="flex items-center gap-1 text-sm">
          <label>
            From
            <input
              type="datetime-local"
              aria-label="View time range from"
              className="ml-1 rounded border border-medium bg-canvas px-1 py-0.5"
              value={unixToDatetimeLocal(viewRange.window.fromUnixSeconds)}
              onChange={(e) => {
                const from = datetimeLocalToUnix(e.target.value);
                if (from !== null) {
                  onAbsolute(from, viewRange.window.toUnixSeconds);
                }
              }}
            />
          </label>
          <label>
            To
            <input
              type="datetime-local"
              aria-label="View time range to"
              className="ml-1 rounded border border-medium bg-canvas px-1 py-0.5"
              value={unixToDatetimeLocal(viewRange.window.toUnixSeconds)}
              onChange={(e) => {
                const to = datetimeLocalToUnix(e.target.value);
                if (to !== null) {
                  onAbsolute(viewRange.window.fromUnixSeconds, to);
                }
              }}
            />
          </label>
        </span>
      )}
      <button
        type="button"
        className="rounded border border-medium px-2 py-1 text-sm"
        aria-label="Reload data"
        disabled={refreshing}
        onClick={onReload}
      >
        {refreshing ? 'Reloading…' : 'Reload'}
      </button>
      <span className="text-xs text-secondary" title={error}>
        {refreshing ? 'Loading…' : error !== undefined ? `Error: ${error}` : `Loaded ${formatLoaded(lastLoadedAt)}`}
        {refreshIntervalSeconds > 0 ? ` · auto ${refreshIntervalSeconds}s` : ''}
      </span>
      {demoMode && (
        <span
          className="rounded bg-[var(--ksg-status-warning)] px-2 py-0.5 text-xs text-inverse"
          data-testid="demo-badge"
        >
          Demo data
        </span>
      )}
    </nav>
  );
}
