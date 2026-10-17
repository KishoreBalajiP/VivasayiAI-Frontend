import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Bell } from 'lucide-react';

// Real i18next (English) so assertions read the words a farmer sees.
import '../../i18n';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  EmptyState,
  Skeleton,
  SkeletonText,
  StatusPill,
  Stepper,
  TONES,
  cn,
  toneClasses,
} from './index';

describe('Button', () => {
  it('UI-1: defaults to type="button" so it never submits a surrounding form by accident', () => {
    const onSubmit = vi.fn((e: Event) => e.preventDefault());
    render(
      <form onSubmit={(e) => onSubmit(e.nativeEvent)}>
        <Button>Save</Button>
      </form>
    );
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveAttribute('type', 'button');
    button.click();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('UI-1: loading sets aria-busy, disables the button and shows a decorative spinner', () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick} leadingIcon={<Bell data-testid="lead" />}>
        Send
      </Button>
    );
    const button = screen.getByRole('button', { name: 'Send' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();
    expect(screen.queryByTestId('lead')).not.toBeInTheDocument();
    const spinner = button.querySelector('svg');
    expect(spinner).toHaveAttribute('aria-hidden', 'true');
    button.click();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('UI-1: variants use tokens (brand-700 primary), never the old gradient; icon buttons keep their label', () => {
    render(
      <>
        <Button>Primary</Button>
        <Button variant="danger">Delete</Button>
        <Button size="icon" aria-label="Send message">
          <Bell aria-hidden="true" />
        </Button>
      </>
    );
    const primary = screen.getByRole('button', { name: 'Primary' });
    expect(primary.className).toContain('bg-brand-700');
    expect(primary.className).not.toMatch(/from-emerald-600|to-green-700/);
    expect(screen.getByRole('button', { name: 'Delete' }).className).toContain('bg-danger-solid');
    expect(screen.getByRole('button', { name: 'Send message' })).toBeInTheDocument();
    expect(primary).not.toHaveAttribute('aria-busy');
  });
});

describe('StatusPill and Badge', () => {
  it('UI-2: StatusPill announces a hidden "Status:" prefix plus an icon and text (never colour alone)', () => {
    render(<StatusPill tone="success">Verified</StatusPill>);
    const pill = screen.getByText('Verified').parentElement!;
    expect(pill).toHaveTextContent('Status: Verified');
    expect(within(pill).getByText(/Status:/)).toHaveClass('sr-only');
    expect(pill.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(pill).toHaveAttribute('data-tone', 'success');
  });

  it('UI-2: every tone has a default icon, and the Tamil prefix is used in Tamil', async () => {
    const { default: i18n } = await import('../../i18n');
    for (const tone of TONES) {
      const { unmount } = render(<Badge tone={tone}>{tone}</Badge>);
      expect(screen.getByText(tone).parentElement!.querySelector('svg')).not.toBeNull();
      unmount();
    }
    await i18n.changeLanguage('ta');
    try {
      render(<StatusPill tone="info">x</StatusPill>);
      expect(screen.getByText(/நிலை:/)).toHaveClass('sr-only');
    } finally {
      await i18n.changeLanguage('en');
    }
  });
});

describe('Alert', () => {
  it('UI-3: danger alerts use role="alert"; every other tone is a polite role="status"', () => {
    render(
      <>
        <Alert tone="danger" title="Upload failed">Try again.</Alert>
        <Alert tone="warning" title="Action needed" />
        <Alert tone="info">FYI</Alert>
      </>
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Upload failed');
    expect(screen.getAllByRole('status')).toHaveLength(2);
  });

  it('UI-3: focusOnMount moves focus to the (programmatically focusable) title', () => {
    render(
      <Alert tone="danger" title="Could not submit" focusOnMount actions={<Button>Retry</Button>}>
        Your draft is saved.
      </Alert>
    );
    const title = screen.getByText('Could not submit');
    expect(title).toHaveAttribute('tabindex', '-1');
    expect(title).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});

describe('Stepper', () => {
  it('UI-4: renders an ordered list, marks the current step with aria-current="step" and hides status text for screen readers', () => {
    render(
      <Stepper
        aria-label="Claim steps"
        items={[
          { id: 'parcel', label: 'Parcel', status: 'complete' },
          { id: 'event', label: 'Event', status: 'current' },
          { id: 'review', label: 'Review', status: 'upcoming' },
        ]}
      />
    );
    const list = screen.getByRole('list', { name: 'Claim steps' });
    expect(list.tagName).toBe('OL');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[1]).toHaveAttribute('aria-current', 'step');
    expect(items[0]).not.toHaveAttribute('aria-current');
    expect(items[0]).toHaveTextContent('Parcel — Completed');
    expect(within(items[2]).getByText(/Not started yet/)).toHaveClass('sr-only');
  });

  it('UI-4: tracker statuses map to icons and currentId wins; item attributes pass through', () => {
    render(
      <Stepper
        currentId="photos"
        items={[
          { id: 'received', label: 'Received', status: 'complete' },
          {
            id: 'photos',
            label: 'Photos',
            status: 'waiting',
            description: 'Retrying',
            attributes: { 'data-testid': 'tracker-stage', 'data-stage-id': 'photos', 'data-stage-status': 'waiting' },
          },
          { id: 'weather', label: 'Weather', status: 'failed' },
        ]}
      />
    );
    const stage = screen.getByTestId('tracker-stage');
    expect(stage).toHaveAttribute('aria-current', 'step');
    expect(stage).toHaveAttribute('data-stage-id', 'photos');
    expect(stage).toHaveTextContent('Waiting');
    expect(screen.getByText('Weather').parentElement).toHaveTextContent('Could not be completed');
  });
});

describe('ConfirmDialog', () => {
  const Harness = ({ tone, onConfirm = vi.fn() }: { tone?: 'primary' | 'danger'; onConfirm?: () => void }) => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <p>Behind the dialog</p>
        <button type="button" onClick={() => setOpen(true)}>
          Withdraw claim
        </button>
        <ConfirmDialog
          open={open}
          tone={tone}
          title="Withdraw this claim?"
          body="You cannot undo this."
          confirmLabel="Withdraw"
          onConfirm={() => {
            onConfirm();
            setOpen(false);
          }}
          onCancel={() => setOpen(false)}
        />
      </>
    );
  };

  it('UI-5: is a labelled, described modal dialog; a danger dialog focuses Cancel first', async () => {
    const user = userEvent.setup();
    render(<Harness tone="danger" />);
    await user.click(screen.getByRole('button', { name: 'Withdraw claim' }));

    const dialog = screen.getByRole('dialog', { name: 'Withdraw this claim?' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('You cannot undo this.');
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('UI-5: a non-destructive dialog focuses the confirm button first', async () => {
    const user = userEvent.setup();
    render(<Harness tone="primary" />);
    await user.click(screen.getByRole('button', { name: 'Withdraw claim' }));
    expect(screen.getByRole('button', { name: 'Withdraw' })).toHaveFocus();
  });

  it('UI-6: Tab and Shift+Tab stay inside the dialog', async () => {
    const user = userEvent.setup();
    render(<Harness tone="danger" />);
    await user.click(screen.getByRole('button', { name: 'Withdraw claim' }));
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const confirm = screen.getByRole('button', { name: 'Withdraw' });

    await user.tab();
    expect(confirm).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.tab({ shift: true });
    expect(confirm).toHaveFocus();
  });

  it('UI-6: Escape cancels and focus returns to the opener; scroll lock is released', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness tone="danger" onConfirm={onConfirm} />);
    const opener = screen.getByRole('button', { name: 'Withdraw claim' });
    await user.click(opener);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(opener).toHaveFocus();
    expect(document.body.style.overflow).toBe('');
  });

  it('UI-6: a backdrop click cancels; confirm calls onConfirm once', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    await user.click(screen.getByRole('button', { name: 'Withdraw claim' }));
    await user.click(screen.getByTestId('confirm-dialog-backdrop'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Withdraw claim' }));
    await user.click(screen.getByRole('button', { name: 'Withdraw' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // A click on non-focusable dialog content used to drop focus to <body>, where the old
  // handler on the dialog never heard Escape and Shift+Tab walked into the page behind.
  it('UI-6: after a click on the dialog text, Escape still cancels and focus returns to the opener', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness tone="danger" onConfirm={onConfirm} />);
    const opener = screen.getByRole('button', { name: 'Withdraw claim' });
    await user.click(opener);
    await user.click(screen.getByText('You cannot undo this.'));
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(opener).toHaveFocus();
  });

  it('UI-6: after a click on the dialog title, Shift+Tab and Tab stay inside the dialog', async () => {
    const user = userEvent.setup();
    render(<Harness tone="danger" />);
    await user.click(screen.getByRole('button', { name: 'Withdraw claim' }));
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const confirm = screen.getByRole('button', { name: 'Withdraw' });

    await user.click(screen.getByRole('heading', { name: 'Withdraw this claim?' }));
    await user.tab({ shift: true });
    expect(confirm).toHaveFocus();

    await user.click(screen.getByText('You cannot undo this.'));
    await user.tab();
    expect(cancel).toHaveFocus();
  });

  it('UI-6: with focus lost to <body>, Escape still cancels and Shift+Tab returns into the dialog', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const { rerender } = render(
      <>
        <button type="button">Behind</button>
        <ConfirmDialog open title="Withdraw?" body="You cannot undo this." confirmLabel="Withdraw" onConfirm={vi.fn()} onCancel={onCancel} />
      </>
    );
    act(() => (document.activeElement as HTMLElement).blur());
    expect(document.activeElement).toBe(document.body);

    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Withdraw' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Behind' })).not.toHaveFocus();

    act(() => (document.activeElement as HTMLElement).blur());
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);

    // Closed: the document listener is gone, so Escape no longer reaches the old handler.
    rerender(
      <>
        <button type="button">Behind</button>
        <ConfirmDialog open={false} title="Withdraw?" confirmLabel="Withdraw" onConfirm={vi.fn()} onCancel={onCancel} />
      </>
    );
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('UI-6: the panel is focusable (tabindex -1) but never a Tab stop; a click on its padding keeps focus in the dialog', async () => {
    const user = userEvent.setup();
    render(<Harness tone="danger" />);
    await user.click(screen.getByRole('button', { name: 'Withdraw claim' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('tabindex', '-1');

    await user.click(dialog);
    expect(dialog).toHaveFocus();

    // From the panel, Tab goes to the first control and Shift+Tab wraps to the last; the panel is
    // never reached by tabbing.
    await user.tab();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.tab();
    await user.tab();
    expect(dialog).not.toHaveFocus();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(dialog);
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Withdraw' })).toHaveFocus();
  });

  it('UI-6: focus moved to the page behind while open is pulled back into the dialog; once closed it is left alone', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness tone="danger" onConfirm={onConfirm} />);
    const opener = screen.getByRole('button', { name: 'Withdraw claim' });
    await user.click(opener);
    const dialog = screen.getByRole('dialog');

    // e.g. a script or assistive technology focusing a control behind the backdrop
    act(() => opener.focus());
    expect(opener).not.toHaveFocus();
    expect(dialog).toHaveFocus();

    // Escape still works from there, and the focus return to the opener is not fought by the trap.
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(opener).toHaveFocus();

    // Closed: the listener is gone, so the page keeps whatever focus it is given.
    act(() => opener.blur());
    act(() => opener.focus());
    expect(opener).toHaveFocus();
  });

  it('UI-6: while busy the dialog cannot be dismissed and confirm shows aria-busy', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog open busy title="Sending" confirmLabel="Send" onConfirm={vi.fn()} onCancel={onCancel} />
    );
    await user.keyboard('{Escape}');
    await user.click(screen.getByTestId('confirm-dialog-backdrop'));
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute('aria-busy', 'true');
  });
});

describe('Card, EmptyState, Skeleton and class helpers', () => {
  it('UI-7: Card is a region labelled by its title; EmptyState shows title, body and action', () => {
    render(
      <>
        <Card titleId="evidence-title">
          <CardHeader>
            <CardTitle id="evidence-title">Evidence</CardTitle>
          </CardHeader>
          <CardBody>2 photos</CardBody>
        </Card>
        <EmptyState icon={Bell} title="No claims yet" body="Start a claim when crops are damaged." action={<Button>New claim</Button>} />
      </>
    );
    expect(screen.getByRole('region', { name: 'Evidence' })).toHaveTextContent('2 photos');
    expect(screen.getByText('No claims yet')).toBeInTheDocument();
    expect(screen.getByText('Start a claim when crops are damaged.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New claim' })).toBeInTheDocument();
  });

  it('UI-7: cn joins truthy parts; toneClasses maps every tone and variant to token classes', () => {
    expect(cn('a', false, null, undefined, 0, 'b')).toBe('a b');
    for (const tone of TONES) {
      expect(toneClasses(tone)).toContain(`bg-${tone}-bg`);
      expect(toneClasses(tone, 'solid')).toContain(`bg-${tone}-solid`);
      expect(toneClasses(tone, 'outline')).toContain(`border-${tone}-border`);
    }
  });

  it('UI-8: skeletons are hidden from assistive technology', () => {
    const { container } = render(
      <div aria-busy="true">
        <Skeleton className="h-4 w-10" />
        <SkeletonText lines={2} />
      </div>
    );
    const skeletons = container.querySelectorAll('[data-skeleton]');
    expect(skeletons).toHaveLength(2);
    skeletons.forEach((node) => expect(node).toHaveAttribute('aria-hidden', 'true'));
  });
});
