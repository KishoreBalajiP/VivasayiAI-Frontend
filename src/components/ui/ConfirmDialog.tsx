import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';

// Replaces window.confirm (blocking, unstyled, untranslatable). Controlled: the parent owns
// `open`, so no provider is needed and components that use it render fine in isolation.
//
// Accessibility contract (covered by UI-5/UI-6):
//   - role="dialog" + aria-modal, labelled by the title and described by the body
//   - focus moves into the dialog; for a destructive (danger) action it lands on Cancel first
//   - Tab / Shift+Tab are trapped inside; Escape and a backdrop click cancel. The keys are heard on
//     `document`, so they still work after a click on the dialog's text (or a busy backdrop) has
//     taken focus off the buttons
//   - the panel itself is focusable (tabIndex -1, never in the Tab order), so a click on its text
//     keeps focus inside; focus that still lands outside while open is pulled back to the panel
//   - focus returns to the element that opened it; page scroll is locked while open
export interface ConfirmDialogProps {
  open: boolean;
  title: ReactNode;
  body?: ReactNode;
  confirmLabel: ReactNode;
  cancelLabel?: ReactNode;
  tone?: 'primary' | 'danger';
  /** While true the confirm button shows a spinner and the dialog cannot be dismissed. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Optional extra content (e.g. a reason field) between the body and the buttons. */
  children?: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const ConfirmDialog = ({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  tone = 'primary',
  busy = false,
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) => {
  const { t } = useTranslation();
  const titleId = useId();
  const bodyId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Open: remember the opener, lock scroll, move focus in. Close/unmount: undo all three.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    (tone === 'danger' ? cancelRef.current : confirmRef.current)?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      if (opener && opener.isConnected) opener.focus();
    };
    // tone is read once per opening on purpose: focus must not jump if the parent re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Keyboard: Escape cancels and Tab is trapped. The listener is on `document` in the capture
  // phase, not on the dialog: a click on non-focusable content can leave focus on <body>, where a
  // handler on the dialog would never see the key and Shift+Tab would walk into the page behind.
  // Capture also runs before any React handler, so an Escape never reaches an overlay underneath.
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (event.isComposing) return; // Escape while composing (Tamil IME) cancels the composition only
        event.stopPropagation();
        if (!busy) onCancel();
        return;
      }
      const panel = panelRef.current;
      if (event.key !== 'Tab' || !panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      // -1: focus is on the panel itself (after a click on its text) or outside the dialog.
      const index = focusable.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && index <= 0) {
        event.preventDefault();
        focusable[focusable.length - 1].focus();
      } else if (!event.shiftKey && (index === -1 || index === focusable.length - 1)) {
        event.preventDefault();
        focusable[0].focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [open, busy, onCancel]);

  // Focus that lands outside the dialog while it is open (a script focusing the page behind, a
  // toast's close button, assistive technology) is pulled back to the panel. Declared after the
  // open/close effect, so on close the opener is refocused while this listener is still attached;
  // the panel ref is already detached by then, so that refocus is left alone.
  useEffect(() => {
    if (!open) return;
    const handleFocusIn = (event: FocusEvent) => {
      const panel = panelRef.current;
      if (!panel || !(event.target instanceof Node) || panel.contains(event.target)) return;
      panel.focus();
    };
    document.addEventListener('focusin', handleFocusIn);
    return () => document.removeEventListener('focusin', handleFocusIn);
  }, [open]);

  if (!open) return null;

  const cancel = () => {
    if (!busy) onCancel();
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center">
      <div data-testid="confirm-dialog-backdrop" aria-hidden="true" className="absolute inset-0 bg-black/40" onClick={cancel} />
      <div
        ref={panelRef}
        // Programmatically focusable (never in the Tab order): a click on the title or body text
        // keeps focus inside the dialog instead of dropping it to <body>.
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={body ? bodyId : undefined}
        className="relative w-full max-w-md rounded-card border border-surface-border bg-white p-5 shadow-xl focus:outline-none"
      >
        <h2 id={titleId} className="text-lg font-semibold text-ink">
          {title}
        </h2>
        {body && (
          <div id={bodyId} className="mt-2 text-sm text-ink-muted">
            {body}
          </div>
        )}
        {children && <div className="mt-3">{children}</div>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button ref={cancelRef} variant="secondary" onClick={cancel} disabled={busy}>
            {cancelLabel ?? t('cancel')}
          </Button>
          <Button
            ref={confirmRef}
            variant={tone === 'danger' ? 'danger' : 'primary'}
            loading={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
};
