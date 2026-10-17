import { cn } from './cn';

// Loading placeholders are decorative (aria-hidden). The CALLER marks the loading region with
// aria-busy="true" so assistive technology knows content is on its way. The pulse stops under
// prefers-reduced-motion (index.css).
export const Skeleton = ({ className }: { className?: string }) => (
  <div aria-hidden="true" data-skeleton="" className={cn('animate-pulse rounded bg-surface-sunken', className)} />
);

export const SkeletonText = ({ lines = 3, className }: { lines?: number; className?: string }) => (
  <div aria-hidden="true" data-skeleton="" className={cn('space-y-2', className)}>
    {Array.from({ length: lines }, (_, i) => (
      <div
        key={i}
        className={cn('h-3 animate-pulse rounded bg-surface-sunken', i === lines - 1 && lines > 1 ? 'w-2/3' : 'w-full')}
      />
    ))}
  </div>
);
