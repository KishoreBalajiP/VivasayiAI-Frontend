import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from './cn';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: ReactNode;
  body?: ReactNode;
  /** Usually one primary Button. */
  action?: ReactNode;
  className?: string;
}

export const EmptyState = ({ icon: Icon, title, body, action, className }: EmptyStateProps) => (
  <div className={cn('flex flex-col items-center justify-center px-4 py-10 text-center', className)}>
    {Icon && (
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-card bg-brand-50 text-brand-700">
        <Icon aria-hidden="true" className="h-6 w-6" />
      </span>
    )}
    <p className="text-base font-semibold text-ink">{title}</p>
    {body && <div className="mt-1 max-w-md text-sm text-ink-muted">{body}</div>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);
