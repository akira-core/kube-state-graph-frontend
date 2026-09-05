import { clsx } from 'clsx';
import type { JSX } from 'react';
import { NavLink } from 'react-router';

import type { RelativeWindow, ViewTimeRange } from '../../shared/time/viewTimeRange';
import { Badge } from '../../shared/ui/Badge';
import { Button } from '../../shared/ui/Button';
import { GraphMarkIcon, RefreshIcon } from '../../shared/ui/icons';
import { Select } from '../../shared/ui/Select';
import { StatusLamp, type LampState } from '../../shared/ui/StatusLamp';
import { useRequiredThemeController, type ThemeChoice } from '../theme';

export interface NavBarProps {
  demoMode: boolean;
  lastLoadedAt: number | null;
  refreshing: boolean;
  error: string | undefined;
  refreshIntervalSeconds: number;
  onReload: () => void;
  reloadDisabled?: boolean;
  viewRange: ViewTimeRange;
  onRelative: (window: RelativeWindow) => void;
  onAbsolute: (fromUnixSeconds: number, toUnixSeconds: number) => void;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// A fixed 24-hour clock, not toLocaleTimeString: the readout sits in a mono column beside
// a lamp, and a locale that renders "下午9:20:28" changes width on every tick.
function formatLoaded(ts: number | null): string {
  if (ts === null) {
    return '--:--:--';
  }
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
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

const VIEWS: ReadonlyArray<{ to: string; label: string }> = [
  { to: '/graph', label: 'Graph' },
  { to: '/sankey', label: 'Sankey' },
];

const DATETIME_INPUT_CLASS =
  'h-7 rounded-md border border-hairline-strong bg-raised px-1.5 font-mono text-[11px] text-primary transition-colors duration-100 hover:bg-raised-hover';

export function NavBar({
  demoMode,
  lastLoadedAt,
  refreshing,
  error,
  refreshIntervalSeconds,
  onReload,
  reloadDisabled = false,
  viewRange,
  onRelative,
  onAbsolute,
}: Readonly<NavBarProps>): JSX.Element {
  const theme = useRequiredThemeController();
  const lamp: LampState = refreshing
    ? 'refreshing'
    : error !== undefined
      ? 'error'
      : lastLoadedAt === null
        ? 'idle'
        : 'live';
  return (
    <nav
      aria-label="Application"
      className="relative flex h-12 shrink-0 items-center gap-3 border-b border-hairline bg-rail px-3 text-primary"
    >
      <span className="flex items-center gap-2 pr-1">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-hairline bg-selected text-primary">
          <GraphMarkIcon size={15} />
        </span>
        <span className="text-[13px] font-semibold tracking-tight">Kube State Graph</span>
      </span>

      <span className="h-5 w-px shrink-0 bg-[var(--ksg-ui-hairline)]" aria-hidden />

      <div className="inline-flex h-7 items-center gap-0.5 rounded-md border border-hairline bg-raised p-0.5">
        {VIEWS.map((view) => (
          <NavLink
            key={view.to}
            to={view.to}
            className={({ isActive }) =>
              clsx(
                'flex h-6 items-center rounded-[5px] px-2.5 text-xs font-medium transition-colors duration-100',
                isActive ? 'bg-selected text-primary shadow-sm' : 'text-secondary hover:text-primary'
              )
            }
          >
            {view.label}
          </NavLink>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-2">
        {demoMode && (
          <Badge variant="notice" size="xs" data-testid="demo-badge">
            Demo data
          </Badge>
        )}

        <label className="flex items-center gap-1.5 text-[11px] text-secondary">
          <span className="uppercase tracking-eyebrow">Range</span>
          <Select
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
            <option value="1h">Last 1h</option>
            <option value="6h">Last 6h</option>
            <option value="24h">Last 24h</option>
            <option value="7d">Last 7d</option>
            <option value="custom">Custom…</option>
          </Select>
        </label>

        {viewRange.kind === 'absolute' && (
          <span className="flex items-center gap-1">
            <input
              type="datetime-local"
              aria-label="View time range from"
              className={DATETIME_INPUT_CLASS}
              value={unixToDatetimeLocal(viewRange.window.fromUnixSeconds)}
              onChange={(e) => {
                const from = datetimeLocalToUnix(e.target.value);
                if (from !== null) {
                  onAbsolute(from, viewRange.window.toUnixSeconds);
                }
              }}
            />
            <span className="text-xs text-muted" aria-hidden>
              →
            </span>
            <input
              type="datetime-local"
              aria-label="View time range to"
              className={DATETIME_INPUT_CLASS}
              value={unixToDatetimeLocal(viewRange.window.toUnixSeconds)}
              onChange={(e) => {
                const to = datetimeLocalToUnix(e.target.value);
                if (to !== null) {
                  onAbsolute(viewRange.window.fromUnixSeconds, to);
                }
              }}
            />
          </span>
        )}

        {/*
          The freshness instrument: lamp, readout and the control that resets it, in one
          housing. Kept together because they answer one question — is what I am looking
          at current, and how do I make it current.
        */}
        <div className="flex h-7 min-w-0 items-center gap-2 rounded-md border border-hairline bg-raised pl-2 pr-0.5">
          <StatusLamp state={lamp} />
          <span
            className="flex min-w-0 items-baseline gap-1.5 font-mono text-[11px] leading-none tabular-nums text-secondary"
            title={error}
            data-testid="nav-status-readout"
          >
            {error !== undefined ? (
              <>
                <span className="text-[var(--ksg-status-critical)]">error</span>
                <span className="max-w-[16rem] truncate text-muted">{error}</span>
              </>
            ) : (
              <>
                <span className="whitespace-nowrap">{formatLoaded(lastLoadedAt)}</span>
                {refreshIntervalSeconds > 0 && (
                  <span className="whitespace-nowrap text-muted">· {refreshIntervalSeconds}s</span>
                )}
              </>
            )}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Reload data"
            title={refreshing ? 'Reloading…' : 'Reload data'}
            disabled={refreshing || reloadDisabled}
            onClick={onReload}
          >
            <RefreshIcon size={14} {...(refreshing ? { className: 'animate-spin' } : {})} />
          </Button>
        </div>

        <label className="flex items-center gap-1.5 text-[11px] text-secondary">
          <span className="uppercase tracking-eyebrow">Theme</span>
          <Select
            aria-label="Theme"
            value={theme.selection}
            onChange={(e) => theme.setChoice(e.target.value as ThemeChoice)}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="system">System</option>
          </Select>
        </label>
      </div>

      {/* Indeterminate activity strip, riding the nav's bottom hairline. */}
      {refreshing && (
        <span className="pointer-events-none absolute inset-x-0 -bottom-px h-px overflow-hidden" aria-hidden>
          <span className="ksg-strip block h-px w-1/3 bg-[var(--ksg-accent-primary)]" />
        </span>
      )}
    </nav>
  );
}
