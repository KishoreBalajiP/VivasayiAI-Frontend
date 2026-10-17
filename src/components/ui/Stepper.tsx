import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Circle,
  CircleDot,
  Clock,
  Loader2,
  MinusCircle,
  type LucideIcon,
} from 'lucide-react';
import { cn } from './cn';

// Wizard statuses (complete/current/upcoming) and tracker statuses (active/waiting/blocked/
// failed/skipped) share one primitive. Unknown statuses are not accepted here: callers map
// backend strings to this set first, so a raw API value is never rendered.
export type StepStatus =
  | 'complete'
  | 'current'
  | 'upcoming'
  | 'active'
  | 'waiting'
  | 'blocked'
  | 'failed'
  | 'skipped';

export interface StepperItem {
  id: string;
  label: ReactNode;
  status: StepStatus;
  description?: ReactNode;
  meta?: ReactNode;
  /** Extra attributes for the <li>, e.g. data-testid / data-stage-id for e2e selectors. */
  attributes?: Record<string, string | undefined>;
}

interface StepperProps {
  items: StepperItem[];
  orientation?: 'horizontal' | 'vertical';
  /** Item that gets aria-current="step"; defaults to the first item whose status is `current`. */
  currentId?: string;
  'aria-label'?: string;
  className?: string;
}

const STATUS_ICON: Record<StepStatus, { icon: LucideIcon; className: string }> = {
  complete: { icon: CheckCircle2, className: 'text-success-solid' },
  current: { icon: CircleDot, className: 'text-brand-700' },
  upcoming: { icon: Circle, className: 'text-ink-subtle' },
  active: { icon: Loader2, className: 'animate-spin text-info-solid' },
  waiting: { icon: Clock, className: 'text-info-solid' },
  blocked: { icon: AlertTriangle, className: 'text-warning-solid' },
  failed: { icon: AlertCircle, className: 'text-danger-solid' },
  skipped: { icon: MinusCircle, className: 'text-quiet-solid' },
};

export const Stepper = ({
  items,
  orientation = 'vertical',
  currentId,
  className,
  ...rest
}: StepperProps) => {
  const { t } = useTranslation();
  const activeId = currentId ?? items.find((item) => item.status === 'current')?.id;
  const vertical = orientation === 'vertical';

  return (
    <ol
      aria-label={rest['aria-label']}
      className={cn(vertical ? 'flex flex-col gap-3' : 'flex flex-wrap items-start gap-x-4 gap-y-2', className)}
    >
      {items.map((item, index) => {
        const { icon: Icon, className: iconClass } = STATUS_ICON[item.status];
        const isCurrent = item.id === activeId;
        return (
          <li
            key={item.id}
            aria-current={isCurrent ? 'step' : undefined}
            data-step-status={item.status}
            className={cn('relative flex min-w-0 gap-2.5', vertical && index < items.length - 1 && 'pb-1')}
            {...item.attributes}
          >
            <Icon aria-hidden="true" className={cn('mt-0.5 h-5 w-5 shrink-0', iconClass)} />
            <div className="min-w-0">
              <p
                className={cn(
                  'text-sm',
                  isCurrent ? 'font-semibold text-ink' : item.status === 'upcoming' ? 'text-ink-subtle' : 'text-ink-muted'
                )}
              >
                {item.label}
                <span className="sr-only">{` — ${t(`stepperStatus_${item.status}`)}`}</span>
              </p>
              {item.description && <div className="mt-0.5 text-xs text-ink-muted">{item.description}</div>}
              {item.meta && <div className="mt-0.5 text-2xs text-ink-subtle">{item.meta}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
};
