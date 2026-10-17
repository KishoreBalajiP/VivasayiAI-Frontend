import type { HTMLAttributes, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  MinusCircle,
  type LucideIcon,
} from 'lucide-react';
import { cn } from './cn';
import { TONE_ICON_CLASSES, toneClasses, type Tone, type ToneVariant } from './tones';

// Default icon per tone: colour is NEVER the only signal, so every badge has an icon + text.
const TONE_ICONS: Record<Tone, LucideIcon> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertCircle,
  info: Info,
  quiet: MinusCircle,
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  variant?: ToneVariant;
  /** Overrides the tone's default icon; pass `null` only when the text alone carries the state. */
  icon?: LucideIcon | null;
  /** Extra content placed before the text, such as the sr-only "Status:" prefix. */
  before?: ReactNode;
  children: ReactNode;
}

export const Badge = ({
  tone = 'quiet',
  variant = 'soft',
  icon,
  before,
  className,
  children,
  ...rest
}: BadgeProps) => {
  const Icon = icon === null ? null : (icon ?? TONE_ICONS[tone]);
  return (
    <span
      data-tone={tone}
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold',
        toneClasses(tone, variant),
        className
      )}
      {...rest}
    >
      {Icon && (
        <Icon
          aria-hidden="true"
          className={cn('h-3.5 w-3.5 shrink-0', variant !== 'solid' && TONE_ICON_CLASSES[tone])}
        />
      )}
      {before}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
};

interface StatusPillProps extends Omit<BadgeProps, 'before'> {
  /** Screen-reader prefix; defaults to the translated "Status:". */
  srPrefix?: string;
}

// A Badge that announces itself as a status ("Status: Submitted") to assistive technology.
export const StatusPill = ({ srPrefix, ...rest }: StatusPillProps) => {
  const { t } = useTranslation();
  return <Badge before={<span className="sr-only">{`${srPrefix ?? t('statusPrefix')} `}</span>} {...rest} />;
};
