import { clsx } from 'clsx';
import type { JSX } from 'react';

import { EyeIcon, EyeSlashIcon } from './icons';

export interface EyeButtonProps {
  name: 'eye' | 'eye-slash';
  tooltip: string;
  onClick: () => void;
  className?: string;
  size?: 'sm' | 'lg';
  'data-testid'?: string;
}

export function EyeButton({
  name,
  tooltip,
  onClick,
  className,
  size = 'lg',
  'data-testid': testId,
}: Readonly<EyeButtonProps>): JSX.Element {
  const Icon = name === 'eye' ? EyeIcon : EyeSlashIcon;
  return (
    <button
      type="button"
      aria-label={tooltip}
      title={tooltip}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded p-1 text-muted transition-colors duration-100 hover:bg-raised-hover hover:text-primary',
        className
      )}
      onClick={onClick}
      {...(testId !== undefined ? { 'data-testid': testId } : {})}
    >
      <Icon size={size === 'lg' ? 14 : 12} />
    </button>
  );
}
