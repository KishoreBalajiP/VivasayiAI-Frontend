// UI-13 (design §3.3) for the claim page sections the tracker reuses: the photo delete action is
// always visible (touch screens have no hover) and goes through a ConfirmDialog; photos have
// meaningful alt text; the appeal panel keeps its place with a skeleton while it loads.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '../i18n';

const api = vi.hoisted(() => ({
  getEvidenceUrl: vi.fn(),
  deleteEvidenceUpload: vi.fn(),
  uploadClaimEvidence: vi.fn(),
  getAppeal: vi.fn(),
  submitAppeal: vi.fn(),
}));
vi.mock('../api/claims', () => api);
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ClaimEvidenceGallery } from './ClaimEvidenceGallery';
import { ClaimAppealPanel } from './ClaimAppealPanel';
import type { ClaimEvidenceEntry } from '../types';

const photo = (uploadId: string): ClaimEvidenceEntry => ({
  uploadId,
  mediaType: 'image/jpeg',
  size: 1000,
  width: 10,
  height: 10,
  status: 'stored',
  uploadedAt: '2026-10-16T09:00:00.000Z',
  createdAt: '2026-10-16T09:00:00.000Z',
});

beforeEach(() => {
  vi.clearAllMocks();
  api.getEvidenceUrl.mockImplementation(async (_claimId: string, id: string) => ({ url: `https://img.test/${id}.jpg`, expiresIn: 60 }));
  api.deleteEvidenceUpload.mockResolvedValue({ removed: true });
});

describe('ClaimEvidenceGallery', () => {
  it('UI-13: every photo has alt text and a visible remove button; removing goes through a dialog (cancel makes no call)', async () => {
    const onChanged = vi.fn();
    render(<ClaimEvidenceGallery claimId="c_1" evidence={[photo('ev1'), photo('ev2')]} canEdit onChanged={onChanged} />);
    expect(await screen.findByRole('img', { name: 'Claim photo 1' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Claim photo 2' })).toBeInTheDocument();

    const remove = screen.getByRole('button', { name: 'Remove photo 2' });
    // Not hover-only: no opacity-0 / group-hover trick hides it.
    expect(remove.className).not.toMatch(/opacity-0|group-hover/);

    await userEvent.click(remove);
    let dialog = await screen.findByRole('dialog', { name: 'Remove this photo from the claim?' });
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(api.deleteEvidenceUpload).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Remove photo 2' }));
    dialog = await screen.findByRole('dialog', { name: 'Remove this photo from the claim?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove photo 2' }));
    await waitFor(() => expect(api.deleteEvidenceUpload).toHaveBeenCalledWith('c_1', 'ev2'));
    expect(onChanged).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('UI-13: no remove buttons when the claim state does not allow changes', async () => {
    render(<ClaimEvidenceGallery claimId="c_1" evidence={[photo('ev1')]} canEdit={false} onChanged={vi.fn()} />);
    expect(await screen.findByRole('img', { name: 'Claim photo 1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove photo/i })).not.toBeInTheDocument();
  });
});

describe('ClaimAppealPanel', () => {
  it('UI-13: shows a busy skeleton while the appeal loads, then the panel', async () => {
    let release!: (value: null) => void;
    api.getAppeal.mockReturnValue(new Promise((resolve) => (release = resolve)));
    render(<ClaimAppealPanel claimId="c_1" language="en" />);
    const loading = screen.getByTestId('appeal-loading');
    expect(loading).toHaveAttribute('aria-busy', 'true');
    expect(loading).toHaveAccessibleName('Loading your appeal…');
    release(null);
    expect(await screen.findByRole('button', { name: 'Appeal decision' })).toBeInTheDocument();
    expect(screen.queryByTestId('appeal-loading')).not.toBeInTheDocument();
  });
});
