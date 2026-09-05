import { cva, type VariantProps } from 'class-variance-authority';
import { clsx } from 'clsx';
import type { ButtonHTMLAttributes, JSX } from 'react';

// Chrome buttons never carry a hue: on a canvas where colour means "this is a pod" or
// "this is critical", a coloured toolbar button would read as data. Emphasis is spent on
// surface and border instead. `primary` is the one exception, reserved for the single
// recovery action on a blocking screen.
export const buttonVariants = cva(
  'inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors duration-100 disabled:pointer-events-none disabled:opacity-45',
  {
    variants: {
      variant: {
        outline:
          'border border-hairline-strong bg-raised text-primary hover:bg-raised-hover active:bg-selected shadow-sm',
        ghost: 'border border-transparent text-secondary hover:bg-raised-hover hover:text-primary',
        primary: 'bg-[var(--ksg-accent-primary)] text-white hover:brightness-110 active:brightness-95',
      },
      size: {
        sm: 'h-6 px-2 text-[11px]',
        md: 'h-7 px-2.5 text-xs',
        lg: 'h-9 px-4 text-sm',
        icon: 'h-7 w-7 p-0',
        'icon-sm': 'h-6 w-6 p-0',
      },
    },
    defaultVariants: { variant: 'outline', size: 'md' },
  }
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, type = 'button', ...rest }: Readonly<ButtonProps>): JSX.Element {
  return <button type={type} className={clsx(buttonVariants({ variant, size }), className)} {...rest} />;
}
