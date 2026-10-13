import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  // Safety Orange takes dark text: white on orange fails contrast (docs/05 §2.4).
  primary: 'bg-orange text-night hover:brightness-110 active:brightness-95',
  secondary: 'border border-line text-fg hover:bg-surface-raised',
  ghost: 'text-fg hover:bg-surface-raised',
  danger: 'bg-alarm text-night hover:brightness-110',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-5 text-base',
  lg: 'h-14 px-7 text-lg',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Shows a busy state and blocks clicks (e.g. while a transaction is pending). */
  busy?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  busy = false,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled === true || busy}
      aria-busy={busy || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-md font-condensed font-semibold uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {busy && (
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
}
