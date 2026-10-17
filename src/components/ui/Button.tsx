import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerOutline';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Busy state: disables the button, sets aria-busy and swaps the leading icon for a spinner. */
  loading?: boolean;
  /** Decorative icon before the label (rendered aria-hidden). */
  leadingIcon?: ReactNode;
}

// Replaces the copy-pasted `bg-gradient-to-r from-emerald-600 to-green-700` strings: primary is a
// flat brand-700 fill, which passes WCAG AA with white text (the gradient's start did not).
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-brand-700 text-white shadow-sm hover:bg-brand-800',
  secondary: 'border border-surface-border bg-white text-ink shadow-sm hover:bg-surface-muted',
  ghost: 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
  danger: 'bg-danger-solid text-white shadow-sm hover:bg-red-800',
  dangerOutline: 'border border-danger-border bg-white text-danger-fg hover:bg-danger-bg',
};

// md and lg meet the 44px tap-target guidance; sm is for dense secondary actions.
const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'min-h-9 gap-1.5 px-3 py-1.5 text-xs',
  md: 'min-h-11 gap-2 px-4 py-2 text-sm',
  lg: 'min-h-12 gap-2.5 px-5 py-3 text-base',
  icon: 'h-10 w-10 shrink-0',
};

const SPINNER_SIZE: Record<ButtonSize, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
  icon: 'h-5 w-5',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    leadingIcon,
    type = 'button',
    disabled,
    className,
    children,
    ...rest
  },
  ref
) {
  const spinner = (
    <Loader2 aria-hidden="true" className={cn(SPINNER_SIZE[size], 'shrink-0 animate-spin')} />
  );
  // Icon-only buttons show just the spinner while busy; labelled buttons keep their label so
  // the accessible name does not change mid-action.
  const content =
    size === 'icon' ? (
      loading ? spinner : children
    ) : (
      <>
        {loading ? spinner : leadingIcon ? <span aria-hidden="true" className="inline-flex shrink-0">{leadingIcon}</span> : null}
        {children}
      </>
    );

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-control font-semibold transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-60',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className
      )}
      {...rest}
    >
      {content}
    </button>
  );
});
