import { clsx } from 'clsx';
import { useEffect, useRef, type JSX } from 'react';

import { EyeSlashIcon } from '../../../../shared/ui/icons';
import type { SearchResult } from '../../types';

import type { ResultListProps } from './ResultList.types';

export const DEFAULT_RESULT_CAP = 50;

function buildSubline(result: SearchResult, labelById: ReadonlyMap<string, string>): string {
  const parts: string[] = [];
  if (result.context?.namespace !== undefined) {
    parts.push(result.context.namespace);
  }
  if (result.context?.cluster !== undefined) {
    parts.push(result.context.cluster);
  }
  if (result.matchedField !== undefined) {
    parts.push(`${result.matchedField.field}: ${result.matchedField.value}`);
  }
  if (result.collapsedUnder !== undefined) {
    const containerLabel = labelById.get(result.collapsedUnder) ?? result.collapsedUnder;
    parts.push(`in ${containerLabel} (collapsed)`);
  }
  return parts.join(' · ');
}

export function ResultList({
  results,
  highlightedIndex,
  labelById,
  onLocate,
  maxVisible = DEFAULT_RESULT_CAP,
}: Readonly<ResultListProps>): JSX.Element {
  const rowRefs = useRef<Array<HTMLLIElement | null>>([]);

  useEffect(() => {
    if (highlightedIndex < 0) {
      return;
    }
    const row = rowRefs.current[highlightedIndex];
    if (row !== null && row !== undefined && typeof row.scrollIntoView === 'function') {
      row.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex]);

  if (results.length === 0) {
    return (
      <div
        className="mt-1 max-h-[40%] overflow-y-auto rounded border border-weak bg-surface shadow"
        data-testid="search-result-list"
        role="listbox"
        aria-label="Search results"
      >
        <div className="px-2.5 py-2 text-sm text-secondary" data-testid="search-no-results">
          No matching nodes
        </div>
      </div>
    );
  }

  const visible = results.slice(0, maxVisible);
  const overflow = results.length - visible.length;

  return (
    <div
      className="mt-1 max-h-[40%] overflow-y-auto rounded border border-weak bg-surface shadow"
      data-testid="search-result-list"
    >
      <ul className="m-0 list-none p-0" role="listbox" aria-label="Search results">
        {visible.map((result, index) => {
          const disabled = result.filterHidden === true;
          const highlighted = index === highlightedIndex;
          const subline = buildSubline(result, labelById);
          return (
            <li
              key={result.id}
              ref={(el) => {
                rowRefs.current[index] = el;
              }}
              role="option"
              aria-selected={highlighted}
              aria-disabled={disabled || undefined}
              data-testid={`search-result-${result.id}`}
              data-disabled={disabled ? 'true' : undefined}
              className={clsx(
                'flex cursor-pointer flex-col gap-0.5 border-b border-weak px-2.5 py-1.5 last:border-b-0 hover:bg-[var(--ksg-border-weak)]',
                highlighted && 'bg-[var(--ksg-border-weak)]',
                disabled && 'cursor-default opacity-55 hover:bg-transparent'
              )}
              onMouseDown={(evt) => {
                evt.preventDefault();
              }}
              onClick={() => {
                if (!disabled) {
                  onLocate(result);
                }
              }}
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium text-primary">
                  {result.label}
                </span>
                {result.kind !== undefined && (
                  <span className="rounded bg-[var(--ksg-border-weak)] px-1.5 py-0.5 text-[11px]">{result.kind}</span>
                )}
                {disabled && <EyeSlashIcon size={14} aria-label="Hidden by filter" />}
              </div>
              {subline.length > 0 && (
                <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-secondary">
                  {subline}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {overflow > 0 && (
        <div className="px-2.5 py-1.5 text-[11px] italic text-secondary" data-testid="search-result-more">
          {overflow} more
        </div>
      )}
    </div>
  );
}
