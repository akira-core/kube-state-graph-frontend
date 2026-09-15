import type { JSX } from 'react';

/** A legend's line sample: the ribbon stroke at legend size, dashed for the write / residual kinds. */
export function Swatch({ color, dashed = false }: Readonly<{ color: string; dashed?: boolean }>): JSX.Element {
  return (
    <svg width="22" height="6" viewBox="0 0 22 6" aria-hidden>
      <path d="M0 3h22" stroke={color} strokeWidth="3" strokeDasharray={dashed ? '4 3' : undefined} />
    </svg>
  );
}
