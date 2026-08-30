import { cva, type VariantProps } from 'class-variance-authority';
import { clsx } from 'clsx';
import type { HTMLAttributes, JSX } from 'react';

export const badgeVariants = cva(
  'inline-flex shrink-0 items-center gap-1 rounded font-medium leading-none whitespace-nowrap',
  {
    variants: {
      variant: {
        // Machine vocabulary — a kind, an id, a dimension value.
        token: 'border border-hairline bg-selected px-1.5 py-1 font-mono text-primary',
        // A count on a control ("Namespace 3").
        count: 'bg-selected px-1.5 py-0.5 font-mono tabular-nums text-secondary',
        // Standing state of the whole view, e.g. demo data.
        notice:
          'border border-[color-mix(in_srgb,var(--ksg-status-warning)_55%,transparent)] bg-[color-mix(in_srgb,var(--ksg-status-warning)_16%,transparent)] px-2 py-1 uppercase tracking-eyebrow text-primary',
      },
      size: {
        xs: 'text-[10px]',
        sm: 'text-[11px]',
      },
    },
    defaultVariants: { variant: 'token', size: 'sm' },
  }
);

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, size, ...rest }: Readonly<BadgeProps>): JSX.Element {
  return <span className={clsx(badgeVariants({ variant, size }), className)} {...rest} />;
}
