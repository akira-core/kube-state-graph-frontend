import type { JSX } from 'react';

import { FilterIcon } from '../../shared/ui/icons';
import { QueryButton } from '../../shared/ui/QueryButton';
import { ScopeSelect } from '../../shared/ui/ScopeSelect';
import { eyebrowClass } from '../../shared/ui/Section';
import { Select } from '../../shared/ui/Select';
import { TRACE_DEFAULTS } from '../graph-data';

import type { TraceDraft } from './traceUrlScope';

export interface TraceScopeBarProps {
  draft: TraceDraft;
  onDraftChange: (patch: Partial<TraceDraft>) => void;
  /** Switch names the last response drew. */
  hostnameOptions: readonly string[];
  /** Why the draft cannot be queried (from the URL or from validation); empty when it can. */
  problems: readonly string[];
  dirty?: boolean;
  inFlight?: boolean;
  onQuery?: () => void;
  onCancel?: () => void;
  hideQuery?: boolean;
}

const NUMBER_INPUT_CLASS =
  'h-8 w-[5.5rem] rounded-md border border-hairline-strong bg-raised px-2 font-mono text-xs text-primary';

function NumberField({
  label,
  testId,
  value,
  placeholder,
  onChange,
}: Readonly<{
  label: string;
  testId: string;
  value: string;
  placeholder: string;
  onChange: (next: string) => void;
}>): JSX.Element {
  return (
    <div className="flex min-w-[5.5rem] flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-eyebrow text-secondary">{label}</span>
      {/* A text box, not type="number": the browser blanks a non-numeric value in a number
          input, so a link carrying `max_hops=abc` would show an empty field beside a
          message about a value the operator cannot see. Refused, never rewritten. */}
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        data-testid={testId}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        className={NUMBER_INPUT_CLASS}
      />
    </div>
  );
}

/**
 * The trace request: start switch, how far to follow, how many interfaces per hop, the
 * backend's contribution threshold, and the direction. Laid out as the other scope bars
 * are — one row of label-over-control columns closed by the Query action. Raw strings all
 * the way: empty means the default, a typed value that does not parse is refused with a
 * message and never quietly rewritten.
 */
export function TraceScopeBar({
  draft,
  onDraftChange,
  hostnameOptions,
  problems,
  dirty = false,
  inFlight = false,
  onQuery = () => undefined,
  onCancel = () => undefined,
  hideQuery = false,
}: Readonly<TraceScopeBarProps>): JSX.Element {
  const disabledReason = problems[0];
  return (
    <div
      aria-label="Trace scope"
      data-testid="trace-controls"
      className="flex shrink-0 flex-col gap-2 border-b border-hairline bg-rail px-3 py-2.5"
    >
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <span className="flex h-8 items-center gap-1.5 pr-1 text-secondary">
          <FilterIcon size={14} />
          <span className={eyebrowClass}>Trace</span>
        </span>

        <ScopeSelect
          label="Hostname"
          mode="single"
          options={hostnameOptions}
          value={draft.hostname === '' ? [] : [draft.hostname]}
          onChange={(next) => onDraftChange({ hostname: next[0] ?? '' })}
          allowCustom
          emptyLabel="Pick a switch"
          emptyHint="Switch names are typed until a query has drawn them."
          testId="trace-hostname"
        />

        <NumberField
          label="Max hops"
          testId="trace-max-hops"
          value={draft.maxHops}
          placeholder={String(TRACE_DEFAULTS.maxHops)}
          onChange={(maxHops) => onDraftChange({ maxHops })}
        />
        <NumberField
          label="Top N"
          testId="trace-top-n"
          value={draft.topN}
          placeholder={String(TRACE_DEFAULTS.topN)}
          onChange={(topN) => onDraftChange({ topN })}
        />
        <NumberField
          label="Threshold %"
          testId="trace-threshold"
          value={draft.threshold}
          placeholder={String(TRACE_DEFAULTS.threshold)}
          onChange={(threshold) => onDraftChange({ threshold })}
        />

        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-eyebrow text-secondary">Track</span>
          <Select
            tone="md"
            aria-label="Track direction"
            data-testid="trace-track-dir"
            value={draft.trackDir}
            onChange={(e) => onDraftChange({ trackDir: e.target.value === 'destination' ? 'destination' : 'source' })}
          >
            <option value="source">source</option>
            <option value="destination">destination</option>
          </Select>
        </label>

        {!hideQuery && (
          <QueryButton
            dirty={dirty}
            inFlight={inFlight}
            disabled={disabledReason !== undefined}
            {...(disabledReason !== undefined ? { disabledReason } : {})}
            onQuery={onQuery}
            onCancel={onCancel}
          />
        )}
      </div>

      {problems.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          {problems.slice(1).map((p) => (
            <span key={p} className="text-[11px] text-[var(--ksg-status-warning)]" data-testid="trace-scope-problem">
              {p}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
