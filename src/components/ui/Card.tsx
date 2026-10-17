import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

interface CardProps extends HTMLAttributes<HTMLElement> {
  /** id of the CardTitle; the card becomes a labelled region for screen readers. */
  titleId?: string;
  children: ReactNode;
}

// A card is a <section>: with a titleId it is announced as "<title>, region".
export const Card = ({ titleId, className, children, ...rest }: CardProps) => (
  <section
    aria-labelledby={titleId}
    className={cn('rounded-card border border-surface-border bg-white shadow-card', className)}
    {...rest}
  >
    {children}
  </section>
);

export const CardHeader = ({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-wrap items-start justify-between gap-2 border-b border-surface-border px-4 py-3 sm:px-5', className)}
    {...rest}
  >
    {children}
  </div>
);

interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  id: string;
  as?: 'h2' | 'h3' | 'h4';
}

export const CardTitle = ({ id, as: Tag = 'h3', className, children, ...rest }: CardTitleProps) => (
  <Tag id={id} className={cn('text-base font-semibold text-ink', className)} {...rest}>
    {children}
  </Tag>
);

export const CardBody = ({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('px-4 py-3 sm:px-5 sm:py-4', className)} {...rest}>
    {children}
  </div>
);
