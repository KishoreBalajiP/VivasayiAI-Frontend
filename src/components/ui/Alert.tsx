import { forwardRef, useEffect, useImperativeHandle, useRef, type ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, type LucideIcon } from 'lucide-react';
import { cn } from './cn';
import { TONE_ICON_CLASSES, toneClasses, type Tone } from './tones';

const ALERT_ICONS: Record<Tone, LucideIcon> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertCircle,
  info: Info,
  quiet: Info,
};

export interface AlertProps {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  /** Buttons rendered under the message (e.g. Retry, Open saved claim). */
  actions?: ReactNode;
  /** Move keyboard/screen-reader focus to the title when the alert appears (error banners). */
  focusOnMount?: boolean;
  icon?: LucideIcon;
  className?: string;
  'data-testid'?: string;
}

// danger → role="alert" (assertive, interrupts); every other tone → role="status" (polite).
// The forwarded ref points at the title so a caller can re-focus the banner after a retry fails.
export const Alert = forwardRef<HTMLParagraphElement, AlertProps>(function Alert(
  { tone = 'info', title, children, actions, focusOnMount = false, icon, className, ...rest },
  ref
) {
  const titleRef = useRef<HTMLParagraphElement>(null);
  // No deps: the title can appear after the first render, so the handle is refreshed each render.
  useImperativeHandle(ref, () => titleRef.current as HTMLParagraphElement);

  useEffect(() => {
    if (focusOnMount) titleRef.current?.focus();
  }, [focusOnMount]);

  const Icon = icon ?? ALERT_ICONS[tone];

  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      data-tone={tone}
      className={cn('flex gap-3 rounded-control px-3 py-2.5 text-sm sm:px-4 sm:py-3', toneClasses(tone, 'soft'), className)}
      {...rest}
    >
      <Icon aria-hidden="true" className={cn('mt-0.5 h-4 w-4 shrink-0', TONE_ICON_CLASSES[tone])} />
      <div className="min-w-0 flex-1">
        {title && (
          <p ref={titleRef} tabIndex={-1} className="font-semibold outline-none focus-visible:underline">
            {title}
          </p>
        )}
        {children && <div className={cn(title ? 'mt-0.5' : undefined, 'break-words')}>{children}</div>}
        {actions && <div className="mt-2 flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
});
