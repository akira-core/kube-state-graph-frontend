import { clsx } from 'clsx';
import type { JSX, ReactNode } from 'react';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Accessible name, when the visible label is a glyph or an abbreviation. */
  ariaLabel?: string;
  title?: string;
}

export interface SegmentedProps<T extends string> {
  /** Radio group name — must be unique on the page. */
  name: string;
  value: T;
  options: ReadonlyArray<SegmentedOption<T>>;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  className?: string;
  'aria-label'?: string;
  'data-testid'?: string;
}

// Segmented control built on real radio inputs: the whole option set is visible at once
// (a two- or three-way choice a dropdown would hide behind a click), while arrow-key
// navigation, form semantics and accessible names stay the browser's.
export function Segmented<T extends string>({
  name,
  value,
  options,
  onChange,
  size = 'sm',
  className,
  'aria-label': ariaLabel,
  'data-testid': testId,
}: Readonly<SegmentedProps<T>>): JSX.Element {
  return (
    <div
      className={clsx(
        'inline-flex items-center gap-0.5 rounded-md border border-hairline bg-raised p-0.5',
        size === 'sm' ? 'h-7' : 'h-8',
        className
      )}
      role="radiogroup"
      {...(ariaLabel !== undefined ? { 'aria-label': ariaLabel } : {})}
      {...(testId !== undefined ? { 'data-testid': testId } : {})}
    >
      {options.map((option) => (
        <label
          key={option.value}
          className="relative flex min-w-0 flex-1"
          {...(option.title !== undefined ? { title: option.title } : {})}
        >
          <input
            type="radio"
            className="peer sr-only"
            name={name}
            value={option.value}
            checked={value === option.value}
            aria-label={option.ariaLabel ?? (typeof option.label === 'string' ? option.label : option.value)}
            onChange={() => onChange(option.value)}
          />
          <span
            className={clsx(
              'flex w-full cursor-pointer select-none items-center justify-center gap-1 truncate rounded-[5px] px-2 font-medium text-secondary transition-colors duration-100',
              'peer-hover:text-primary peer-checked:bg-selected peer-checked:text-primary peer-checked:shadow-sm',
              'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-[var(--ksg-accent-primary)]',
              size === 'sm' ? 'text-[11px]' : 'text-xs'
            )}
          >
            {option.label}
          </span>
        </label>
      ))}
    </div>
  );
}
