import { describe, it, expect } from 'vitest';
import { detectImageType, MAX_IMAGE_BYTES, validateImageFile } from './imageValidation';

// tiny "valid"-looking headers — only the preamble matters for magic-byte sniffing
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);
// EXIF-bearing camera JPEG — same magic, real cameras output this
const CAMERA_JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe1, 0x00, 0x10, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x49, 0x49,
]);
// HEIC-ish (ftyp at offset 4) — a real device format with no approved signature
const HEIC = new Uint8Array([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
]);
// %PDF header — a real document, not an image
const PDF = new TextEncoder().encode('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj');
const JUNK = new TextEncoder().encode('definitely not an image bytes');

const makeFile = (bytes: Uint8Array, name: string, type: string): File =>
  new File([bytes as BlobPart], name, { type });

describe('validateImageFile — PREMIUM IMAGE PASS acceptance matrix', () => {
  it('accepts a plain JPEG declared as image/jpeg', async () => {
    await expect(validateImageFile(makeFile(JPEG, 'leaf.jpg', 'image/jpeg'))).resolves.toEqual({
      type: 'jpeg',
    });
  });

  it('accepts a JPEG whose browser MIME is MISSING/empty (camera/odd files)', async () => {
    await expect(validateImageFile(makeFile(JPEG, 'leaf.jpg', ''))).resolves.toEqual({
      type: 'jpeg',
    });
  });

  it('accepts a JPEG with an unusual MIME (application/octet-stream) — sniff wins', async () => {
    await expect(
      validateImageFile(makeFile(JPEG, 'leaf.jpg', 'application/octet-stream'))
    ).resolves.toEqual({ type: 'jpeg' });
  });

  it('accepts a JPEG with the vendor MIME alias image/jpg', async () => {
    await expect(validateImageFile(makeFile(JPEG, 'leaf.jpg', 'image/jpg'))).resolves.toEqual({
      type: 'jpeg',
    });
  });

  it('accepts a PNG declared as image/png', async () => {
    await expect(validateImageFile(makeFile(PNG, 'leaf.png', 'image/png'))).resolves.toEqual({
      type: 'png',
    });
  });

  it('accepts a WebP declared as image/webp', async () => {
    await expect(validateImageFile(makeFile(WEBP, 'leaf.webp', 'image/webp'))).resolves.toEqual({
      type: 'webp',
    });
  });

  it('accepts a WebP with an empty MIME (Android file-manager case)', async () => {
    await expect(validateImageFile(makeFile(WEBP, 'leaf.webp', ''))).resolves.toEqual({
      type: 'webp',
    });
  });

  it('accepts an EXIF-bearing camera JPEG', async () => {
    await expect(validateImageFile(makeFile(CAMERA_JPEG, 'camera.jpg', 'image/jpeg'))).resolves.toEqual(
      { type: 'jpeg' }
    );
  });

  it('accepts a HEIC accepted purely on the browser image/* MIME (type null; backend is judge)', async () => {
    await expect(validateImageFile(makeFile(HEIC, 'camera.heic', 'image/heic'))).resolves.toEqual({
      type: null,
    });
  });

  it('does NOT reject a file exactly AT the 5 MB cap', async () => {
    const padded = new Uint8Array(MAX_IMAGE_BYTES);
    padded.set(JPEG, 0);
    await expect(validateImageFile(makeFile(padded, 'big.jpg', 'image/jpeg'))).resolves.toEqual({
      type: 'jpeg',
    });
  });

  it('rejects a file one byte OVER the 5 MB cap with imageTooLarge', async () => {
    const padded = new Uint8Array(MAX_IMAGE_BYTES + 1);
    padded.set(JPEG, 0);
    await expect(validateImageFile(makeFile(padded, 'huge.jpg', 'image/jpeg'))).rejects.toMatchObject(
      { key: 'imageTooLarge' }
    );
  });

  it('rejects junk bytes with no MIME as unsupportedImage', async () => {
    await expect(validateImageFile(makeFile(JUNK, 'notes.txt', ''))).rejects.toMatchObject({
      key: 'unsupportedImage',
    });
  });

  it('rejects a real PDF declaring application/pdf as unsupportedImage', async () => {
    await expect(validateImageFile(makeFile(PDF, 'doc.pdf', 'application/pdf'))).rejects.toMatchObject(
      { key: 'unsupportedImage' }
    );
  });

  it('accepts a PDF RENAMED to .jpg (browser says image; backend must reject, not the frontend)', async () => {
    await expect(validateImageFile(makeFile(PDF, 'scam.jpg', 'image/jpeg'))).resolves.toEqual({
      type: null,
    });
  });

  it('accepts corrupt bytes that CLAIM to be an image (defers to backend — never front-rejects)', async () => {
    await expect(validateImageFile(makeFile(JUNK, 'broken.png', 'image/png'))).resolves.toEqual({
      type: null,
    });
  });
});

describe('detectImageType smoke', () => {
  it('identifies JPEG/PNG/WebP magic but rejects %PDF', () => {
    expect(detectImageType(JPEG)).toBe('jpeg');
    expect(detectImageType(PNG)).toBe('png');
    expect(detectImageType(WEBP)).toBe('webp');
    expect(detectImageType(PDF)).toBeNull();
    expect(detectImageType(JUNK)).toBeNull();
  });
});