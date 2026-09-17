// Client-side image validation (PREMIUM IMAGE PASS).
//
// The backend is authoritative: it sniffs magic bytes (utils/imageFormat.js in the backend
// repo) and accepts ONLY JPEG, PNG and WebP, capped at 5 MB (env IMAGE_UPLOAD_MAX_BYTES).
// The frontend previously judged files by `file.type` alone, which incorrectly rejected
// perfectly valid images whose MIME was empty or vendor-specific (e.g. `image/webp` uploads
// from some Android file managers, camera-exported files, or files with no declared type).
//
// This guard is deliberately permissive about MIME/extension: a file is accepted when the
// magic bytes match a known image OR the browser/OS identifies it as an image (`image/*`).
// The rejected-only-when-neither rule means valid camera/odd-MIME images are never blocked
// here, while the backend stays the final judge of the actual bytes (a renamed PDF or a
// corrupt file still fails its sniff + Sharp decode with a clean 400-level processing error).
// Size is capped at the same 5 MB as the backend.

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

// Full UX guard: rejects oversized files with 'imageTooLarge' and content that is neither a
// sniffed JPEG/PNG/WebP nor browser-identified as an image with 'unsupportedImage'. Accepts
// when EITHER signal says image (magic bytes OR `image/*` MIME) — the backend re-verifies the
// real bytes. Resolves with the detected format for the preview badge (null when only the
// browser's `image/*` MIME vouched for the file).
export const validateImageFile = async (
  file: File
): Promise<{ type: 'jpeg' | 'png' | 'webp' | null }> => {
  if (file.size > MAX_IMAGE_BYTES) {
    throw { key: 'imageTooLarge' } satisfies FileValidationError;
  }

  const head = file.slice(0, 16);
  const bytes = new Uint8Array(await head.arrayBuffer());
  const detected = detectImageType(bytes);

  // Browser/OS MIME is never the sole decider on its own (`file.type === 'image/*'` alone can
  // be misleading on renamed files) but it is a legitimate acceptance signal for valid images
  // the magic sniff cannot recognize (e.g. HEIC, TIFF) — those still get a clean backend
  // 400-level processing error if unsupported, never a fake success. Reject only when neither
  // the bytes nor the declared MIME indicate an image.
  const browserSaysImage = (file.type || '').toLowerCase().startsWith('image/');
  if (!detected && !browserSaysImage) {
    throw { key: 'unsupportedImage' } satisfies FileValidationError;
  }
  return { type: detected };
};