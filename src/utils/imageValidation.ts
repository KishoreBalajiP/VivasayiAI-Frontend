// Client-side image validation (PREMIUM IMAGE PASS).
//
// The backend is authoritative: it sniffs magic bytes (utils/imageFormat.js in the backend
// repo) and accepts ONLY JPEG, PNG and WebP, capped at 5 MB. The frontend previously judged
// files by `file.type` alone, which incorrectly rejected perfectly valid images whose MIME
// was empty or vendor-specific (e.g. `image/webp` uploads from some Android file managers,
// or files with no declared type). We now sniff the same three magic-byte signatures
// client-side, so:
//   - a valid WebP (or JPG/PNG) with an unknown/empty MIME is accepted;
//   - a renamed non-image (e.g. a .txt renamed to .jpg) is rejected with an accurate error;
//   - the error text always matches the backend-approved formats.
// Size is capped at the same 5 MB as the backend (env IMAGE_UPLOAD_MAX_BYTES).

export type ImageSniffErrorKey = 'imageTooLarge' | 'unsupportedImage';

export interface FileValidationError {
  key: ImageSniffErrorKey;
}

const JPEG_SIG = [0xff, 0xd8, 0xff];
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const isJpeg = (b: Uint8Array): boolean =>
  b.length >= 3 && b[0] === JPEG_SIG[0] && b[1] === JPEG_SIG[1] && b[2] === JPEG_SIG[2];

const isPng = (b: Uint8Array): boolean =>
  b.length >= PNG_SIG.length && PNG_SIG.every((byte, i) => b[i] === byte);

const isWebp = (b: Uint8Array): boolean =>
  b.length >= 12 &&
  String.fromCharCode(b[0], b[1], b[2], b[3]) === 'RIFF' &&
  String.fromCharCode(b[8], b[9], b[10], b[11]) === 'WEBP';

// Returns 'jpeg' | 'png' | 'webp' | null for the upload's first bytes. Returns null when the
// file is not one of the approved images (matches backend detectImageMime).
export const detectImageType = (bytes: Uint8Array): 'jpeg' | 'png' | 'webp' | null => {
  if (isPng(bytes)) return 'png';
  if (isJpeg(bytes)) return 'jpeg';
  if (isWebp(bytes)) return 'webp';
  return null;
};

// Full UX guard: rejects oversized files with 'imageTooLarge' and non-approved content with
// 'unsupportedImage'. Resolves with the detected format for the preview badge.
export const validateImageFile = async (
  file: File
): Promise<{ type: 'jpeg' | 'png' | 'webp' }> => {
  if (file.size > MAX_IMAGE_BYTES) {
    throw { key: 'imageTooLarge' } satisfies FileValidationError;
  }

  const head = file.slice(0, 16);
  const bytes = new Uint8Array(await head.arrayBuffer());
  const type = detectImageType(bytes);
  if (!type) {
    throw { key: 'unsupportedImage' } satisfies FileValidationError;
  }
  return { type };
};