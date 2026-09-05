import { clsx } from 'clsx';
import type { JSX, SelectHTMLAttributes } from 'react';

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  /** `sm` matches the toolbar row height; `md` is for standalone fields. */
  tone?: 'sm' | 'md';
};

// A native <select> with the platform chrome replaced, not the element. Keyboard
// behaviour, screen-reader semantics and the mobile picker all stay native; only the
// caret and the box are ours (see `select.ksg-select` in index.css).
export function Select({ className, tone = 'sm', ...rest }: Readonly<SelectProps>): JSX.Element {
  return (
    <select
      className={clsx(
        'ksg-select cursor-pointer rounded-md border border-hairline-strong bg-raised pl-2 pr-6 font-medium text-primary transition-colors duration-100 hover:bg-raised-hover',
        tone === 'sm' ? 'h-7 text-xs' : 'h-8 text-sm',
        className
      )}
      {...rest}
    />
  );
}
