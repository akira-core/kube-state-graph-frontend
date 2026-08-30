import { clsx } from 'clsx';
import type { JSX } from 'react';

export interface IconProps {
  size?: number;
  className?: string;
  'aria-label'?: string;
}

function SvgIcon({
  size = 16,
  className,
  children,
  'aria-label': ariaLabel,
}: Readonly<IconProps> & { children: JSX.Element | JSX.Element[] }): JSX.Element {
  const labelled = ariaLabel !== undefined;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={labelled ? undefined : true}
      {...(labelled ? { 'aria-label': ariaLabel, role: 'img' } : {})}
    >
      {children}
    </svg>
  );
}

export function EyeIcon(props: Readonly<IconProps>): JSX.Element {
  return (
    <SvgIcon {...props}>
      <path d="M2.2 12s3.6-7 9.8-7 9.8 7 9.8 7-3.6 7-9.8 7-9.8-7-9.8-7Z" />
      <circle cx="12" cy="12" r="3" />
    </SvgIcon>
  );
}

export function EyeSlashIcon(props: Readonly<IconProps>): JSX.Element {
  return (
    <SvgIcon {...props}>
      <path d="M3 3l18 18" />
      <path d="M10.6 6.2A10.4 10.4 0 0 1 12 6c6.2 0 9.8 7 9.8 7a16.7 16.7 0 0 1-3.2 3.8" />
      <path d="M6.5 6.7A16.6 16.6 0 0 0 2.2 12S5.8 19 12 19c1.3 0 2.5-.2 3.6-.6" />
      <path d="M9.9 9.9A3 3 0 0 0 12 15a3 3 0 0 0 2.1-.9" />
    </SvgIcon>
  );
}

export function CloseIcon(props: Readonly<IconProps>): JSX.Element {
  return (
    <SvgIcon {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </SvgIcon>
  );
}

export function SearchIcon(props: Readonly<IconProps>): JSX.Element {
  return (
    <SvgIcon {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-3.6-3.6" />
    </SvgIcon>
  );
}

export function SpinnerIcon({ size = 14, className }: Readonly<IconProps>): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={clsx('animate-spin', className)}
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function ExternalLinkIcon(props: Readonly<IconProps>): JSX.Element {
  return (
    <SvgIcon {...props}>
      <path d="M14 5h5v5" />
      <path d="M10 14L19 5" />
      <path d="M19 13v6H5V5h6" />
    </SvgIcon>
  );
}

export function PlusCircleIcon(props: Readonly<IconProps>): JSX.Element {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </SvgIcon>
  );
}

export function MinusCircleIcon(props: Readonly<IconProps>): JSX.Element {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h8" />
    </SvgIcon>
  );
}

export function CaretRightIcon(props: Readonly<IconProps>): JSX.Element {
  return (
    <SvgIcon {...props}>
      <path d="M9 6l6 6-6 6" />
    </SvgIcon>
  );
}

export function CaretDownIcon(props: Readonly<IconProps>): JSX.Element {
  return (
    <SvgIcon {...props}>
      <path d="M6 9l6 6 6-6" />
    </SvgIcon>
  );
}
