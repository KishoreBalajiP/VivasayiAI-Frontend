// Land-documents section on the claim detail: list, view (signed URL on demand) and upload.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import '../i18n';

const { mockList, mockUrl, mockUpload } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockUrl: vi.fn(),
  mockUpload: vi.fn(),
}));

vi.mock('../api/claims', () => ({
  listOwnershipEvidence: mockList,
  getOwnershipDocumentUrl: mockUrl,
  uploadOwnershipDocument: mockUpload,
  OWNERSHIP_DOCUMENT_ACCEPT: 'image/jpeg,image/png,image/webp',
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../utils/imageValidation', () => ({
  validateImageFile: async () => ({ type: 'jpeg' as const }),
  MAX_IMAGE_BYTES: 5 * 1024 * 1024,
}));

import { ClaimOwnershipDocuments } from './ClaimOwnershipDocuments';

const row = {
  id: 'ev1',
  claimId: 'c_1',
  source: 'OWNERSHIP',
  status: 'PENDING',
  reference: 'img_1',
  metadata: { documentCategory: 'lease_agreement' },
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockResolvedValue({ claimId: 'c_1', evidence: [row], summary: {} });
  mockUrl.mockResolvedValue({ uploadId: 'img_1', mediaType: 'image/jpeg', signedUrl: 'https://s3.local/read', expiresIn: 1 });
  mockUpload.mockResolvedValue(row);
});

describe('ClaimOwnershipDocuments', () => {
  it('lists documents with farmer wording and shows what the relationship needs', async () => {
    render(<ClaimOwnershipDocuments claimId="c_1" relationship="tenant" canAttach language="en" />);
    expect(await screen.findByText('Lease agreement', { selector: 'div' })).toBeInTheDocument();
    expect(screen.getByText(/Waiting for review/)).toBeInTheDocument();
    expect(screen.getByText(/For "I farm it on lease \(tenant\)" we usually need/)).toBeInTheDocument();
    expect(screen.getByText('Land record (patta / chitta) or Ownership deed or Land tax receipt')).toBeInTheDocument();
    expect(screen.getByText(/not an official government verification/)).toBeInTheDocument();
  });

  it('mints the signed URL only when the farmer asks to view', async () => {
    const user = userEvent.setup();
    render(<ClaimOwnershipDocuments claimId="c_1" relationship={null} canAttach language="en" />);
    await screen.findByText('Lease agreement', { selector: 'div' });
    expect(mockUrl).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /view/i }));
    await waitFor(() => expect(mockUrl).toHaveBeenCalledWith('c_1', 'ev1'));
    expect(await screen.findByRole('img')).toHaveAttribute('src', 'https://s3.local/read');
  });

  it('uploads with the chosen category, then reloads the list and notifies the parent', async () => {
    const onChanged = vi.fn();
    render(<ClaimOwnershipDocuments claimId="c_1" relationship="owner" canAttach language="en" onChanged={onChanged} />);
    await screen.findByText('Lease agreement', { selector: 'div' });

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ownership_deed' } });
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'deed.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('ownership-file-input'), { target: { files: [file] } });

    await waitFor(() => expect(mockUpload).toHaveBeenCalledWith('c_1', file, 'ownership_deed'));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(mockList).toHaveBeenCalledTimes(2);
  });

  it('hides the upload controls when attaching is not allowed', async () => {
    render(<ClaimOwnershipDocuments claimId="c_1" relationship={null} canAttach={false} language="en" />);
    await screen.findByText('Lease agreement', { selector: 'div' });
    expect(screen.queryByTestId('ownership-file-input')).not.toBeInTheDocument();
  });
});
