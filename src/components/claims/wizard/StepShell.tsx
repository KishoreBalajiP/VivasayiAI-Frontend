import type { ReactNode, Ref } from 'react';

// One wizard step: a heading the wizard moves focus to on every step change (tabIndex -1, so it
// is focusable by script but never a Tab stop), then the step body.
export const StepShell = ({
  title,
  headingRef,
  description,
  children,
}: {
  title: ReactNode;
  headingRef?: Ref<HTMLHeadingElement>;
  description?: ReactNode;
  children: ReactNode;
}) => (
  <div>
    <h3 ref={headingRef} tabIndex={-1} className="mb-3 text-base font-bold text-ink outline-none focus-visible:underline">
      {title}
    </h3>
    {description && <p className="-mt-1 mb-3 text-xs text-ink-muted">{description}</p>}
    {children}
  </div>
);

export default StepShell;
