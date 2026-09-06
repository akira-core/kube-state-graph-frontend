import * as Popover from '@radix-ui/react-popover';
import { clsx } from 'clsx';
import { useId, useMemo, useRef, useState, type JSX, type KeyboardEvent, type PointerEvent } from 'react';

import { CloseIcon } from './icons';

export type ScopeSelectMode = 'single' | 'multi';

export interface ScopeSelectProps {
  label: string;
  mode: ScopeSelectMode;
  options: readonly string[];
  value: readonly string[];
  onChange: (next: string[]) => void;
  allowCustom: boolean;
  optionLabel?: (value: string) => string;
  testId?: string;
}

const PILL_VISIBLE = 2;

function displayName(value: string, optionLabel: ((value: string) => string) | undefined): string {
  return optionLabel?.(value) ?? value;
}

function shownOptions(options: readonly string[], selected: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of options) {
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  for (const item of selected) {
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

function matchesQuery(value: string, label: string, query: string): boolean {
  if (query === '') {
    return true;
  }
  const needle = query.toLowerCase();
  return value.toLowerCase().includes(needle) || label.toLowerCase().includes(needle);
}

function exactMatch(options: readonly string[], query: string): boolean {
  const needle = query.toLowerCase();
  return options.some((item) => item.toLowerCase() === needle);
}

type ListItem =
  | { kind: 'all'; id: string }
  | { kind: 'option'; id: string; value: string; unlisted: boolean }
  | { kind: 'custom'; id: string; text: string };

/**
 * Grafana-variable dropdown: trigger summary + popover search/listbox.
 *
 * Radix Popover owns anchoring, outside-click and Escape. The listbox, All row,
 * custom-value row and keyboard move/toggle are ours — Radix has no combobox.
 */
export function ScopeSelect({
  label,
  mode,
  options,
  value,
  onChange,
  allowCustom,
  optionLabel,
  testId,
}: Readonly<ScopeSelectProps>): JSX.Element {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const closedByTab = useRef(false);
  const selected = useMemo(() => [...value], [value]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const allOptions = useMemo(() => shownOptions(options, selected), [options, selected]);
  const optionSet = useMemo(() => new Set(options), [options]);
  const trimmedQuery = query.trim();
  const filtered = useMemo(
    () => allOptions.filter((item) => matchesQuery(item, displayName(item, optionLabel), trimmedQuery)),
    [allOptions, optionLabel, trimmedQuery]
  );
  const showCustom = allowCustom && trimmedQuery.length > 0 && !exactMatch(allOptions, trimmedQuery);
  const items = useMemo<ListItem[]>(() => {
    const next: ListItem[] = [];
    // `All` empties the dimension. With nothing listed and nothing selected there is
    // nothing for it to empty, so it would be a permanently checked row above an empty
    // list — the popover is the search box and the custom-value row, and no more.
    // A custom value, once added, puts it back: `allOptions` unions in the selection.
    if (mode === 'multi' && allOptions.length > 0) {
      next.push({ kind: 'all', id: `${listId}-all` });
    }
    for (const item of filtered) {
      next.push({
        kind: 'option',
        id: `${listId}-opt-${item}`,
        value: item,
        unlisted: !optionSet.has(item),
      });
    }
    if (showCustom) {
      next.push({ kind: 'custom', id: `${listId}-custom`, text: trimmedQuery });
    }
    return next;
  }, [allOptions.length, filtered, listId, mode, optionSet, showCustom, trimmedQuery]);

  const activeItem = items[Math.min(active, Math.max(0, items.length - 1))];
  const nothingSelected = selected.length === 0;
  const overflow = Math.max(0, selected.length - PILL_VISIBLE);
  const visiblePills = selected.slice(0, PILL_VISIBLE);
  const noOptionsMessage = !allowCustom && allOptions.length === 0;

  const commit = (next: string[]): void => {
    if (next.length === selected.length && next.every((item, i) => item === selected[i])) {
      return;
    }
    onChange(next);
  };

  const toggle = (item: string): void => {
    if (mode === 'single') {
      commit([item]);
      setOpen(false);
      return;
    }
    if (selectedSet.has(item)) {
      commit(selected.filter((v) => v !== item));
      return;
    }
    commit([...selected, item]);
  };

  const activate = (item: ListItem | undefined): void => {
    if (item === undefined) {
      return;
    }
    if (item.kind === 'all') {
      commit([]);
      return;
    }
    if (item.kind === 'custom') {
      if (mode === 'single') {
        commit([item.text]);
        setOpen(false);
        return;
      }
      if (!selectedSet.has(item.text)) {
        commit([...selected, item.text]);
      }
      return;
    }
    toggle(item.value);
  };

  const move = (delta: number): void => {
    if (items.length === 0) {
      return;
    }
    setActive((prev) => {
      const next = prev + delta;
      if (next < 0) {
        return items.length - 1;
      }
      if (next >= items.length) {
        return 0;
      }
      return next;
    });
  };

  const onSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(1);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(-1);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      activate(activeItem);
      return;
    }
    if (e.key === 'Tab') {
      closedByTab.current = true;
      setOpen(false);
    }
  };

  const onTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>): void => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  };

  const removePill = (item: string, e: PointerEvent<HTMLSpanElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    commit(selected.filter((v) => v !== item));
  };

  const openChange = (next: boolean): void => {
    setOpen(next);
    if (next) {
      setQuery('');
      setActive(0);
    }
  };

  return (
    <div className="flex min-w-[9rem] max-w-[18rem] flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-eyebrow text-secondary">{label}</span>
      <Popover.Root open={open} onOpenChange={openChange}>
        <Popover.Trigger asChild>
          <button
            ref={triggerRef}
            type="button"
            aria-label={label}
            aria-haspopup="listbox"
            aria-expanded={open}
            data-testid={testId}
            className="flex min-h-8 w-full items-center gap-1 rounded-md border border-hairline-strong bg-raised px-1.5 py-0.5 text-left text-xs text-primary transition-colors duration-100 hover:bg-raised-hover"
            onKeyDown={onTriggerKeyDown}
          >
            {nothingSelected ? (
              <span className="px-0.5 text-secondary">All</span>
            ) : (
              <span className="flex min-w-0 flex-wrap items-center gap-1">
                {visiblePills.map((item) => (
                  <span
                    key={item}
                    title={!optionSet.has(item) ? 'Not in the current option list' : undefined}
                    data-unlisted={!optionSet.has(item) ? 'true' : undefined}
                    className={clsx(
                      'inline-flex max-w-[9rem] items-center gap-0.5 rounded border bg-selected py-px pl-1.5 pr-0.5 font-mono text-[11px]',
                      optionSet.has(item) ? 'border-hairline' : 'border-dashed border-hairline-strong'
                    )}
                  >
                    <span className="truncate">{displayName(item, optionLabel)}</span>
                    <span
                      role="button"
                      aria-label={`Remove ${label} ${item}`}
                      tabIndex={-1}
                      className="rounded p-0.5 text-muted hover:bg-raised-hover hover:text-primary"
                      onPointerDown={(e) => removePill(item, e)}
                    >
                      <CloseIcon size={10} />
                    </span>
                  </span>
                ))}
                {overflow > 0 && (
                  <span className="text-[11px] text-secondary" data-testid={`${testId ?? 'scope'}-overflow`}>
                    +{overflow}
                  </span>
                )}
              </span>
            )}
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={4}
            collisionPadding={8}
            avoidCollisions={false}
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              searchRef.current?.focus();
            }}
            onCloseAutoFocus={(e) => {
              if (closedByTab.current) {
                e.preventDefault();
                closedByTab.current = false;
                return;
              }
              e.preventDefault();
              triggerRef.current?.focus();
            }}
            className="z-[1100] w-[min(18rem,calc(100vw-1.5rem))] rounded-md border border-hairline-strong bg-raised p-1 shadow-panel"
          >
            <input
              ref={searchRef}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={open}
              aria-controls={listId}
              aria-activedescendant={activeItem?.id}
              aria-label={`Search ${label}`}
              placeholder="Search"
              value={query}
              onChange={(e) => {
                setQuery(e.currentTarget.value);
                setActive(0);
              }}
              onKeyDown={onSearchKeyDown}
              className="mb-1 h-7 w-full rounded border border-hairline bg-canvas px-2 text-xs text-primary outline-none"
            />
            <ul
              id={listId}
              role="listbox"
              aria-label={label}
              aria-multiselectable={mode === 'multi' ? true : undefined}
              className="ksg-scroll max-h-56 overflow-y-auto"
            >
              {items.map((item, index) => {
                const isActive = item.id === activeItem?.id;
                if (item.kind === 'all') {
                  return (
                    <li
                      key={item.id}
                      id={item.id}
                      role="option"
                      aria-selected={nothingSelected}
                      data-active={isActive ? 'true' : undefined}
                      className={clsx(
                        'flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs',
                        isActive ? 'bg-selected' : 'hover:bg-raised-hover'
                      )}
                      onMouseEnter={() => setActive(index)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => activate(item)}
                    >
                      <CheckMark checked={nothingSelected} />
                      All
                    </li>
                  );
                }
                if (item.kind === 'custom') {
                  return (
                    <li
                      key={item.id}
                      id={item.id}
                      role="option"
                      aria-selected={false}
                      data-active={isActive ? 'true' : undefined}
                      className={clsx(
                        'cursor-pointer rounded px-1.5 py-1 text-xs text-secondary',
                        isActive ? 'bg-selected' : 'hover:bg-raised-hover'
                      )}
                      onMouseEnter={() => setActive(index)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => activate(item)}
                    >
                      Use &quot;{item.text}&quot;
                    </li>
                  );
                }
                const checked = selectedSet.has(item.value);
                return (
                  <li
                    key={item.id}
                    id={item.id}
                    role="option"
                    aria-selected={checked}
                    title={item.unlisted ? 'Not in the current option list' : undefined}
                    data-unlisted={item.unlisted ? 'true' : undefined}
                    data-active={isActive ? 'true' : undefined}
                    className={clsx(
                      'flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs',
                      isActive ? 'bg-selected' : 'hover:bg-raised-hover',
                      item.unlisted && 'italic'
                    )}
                    onMouseEnter={() => setActive(index)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => activate(item)}
                  >
                    {mode === 'multi' && <CheckMark checked={checked} />}
                    <span className="min-w-0 truncate font-mono">{displayName(item.value, optionLabel)}</span>
                  </li>
                );
              })}
              {noOptionsMessage && filtered.length === 0 && !showCustom && (
                <li className="px-1.5 py-2 text-xs text-muted">No options available</li>
              )}
            </ul>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

function CheckMark({ checked }: Readonly<{ checked: boolean }>): JSX.Element {
  return (
    <span
      aria-hidden
      className={clsx(
        'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border',
        checked ? 'border-hairline-strong bg-selected text-primary' : 'border-hairline-strong bg-canvas'
      )}
    >
      {checked ? (
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M2.5 6.2L5 8.7 9.5 3.5" />
        </svg>
      ) : null}
    </span>
  );
}
