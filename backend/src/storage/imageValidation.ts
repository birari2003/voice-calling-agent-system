/** Image types accepted for complaint photos, identified by their file signature. */
export const IMAGE_TYPES = {
  'image/jpeg': { extension: 'jpg', extensions: ['jpg', 'jpeg'] },
  'image/png': { extension: 'png', extensions: ['png'] },
  'image/webp': { extension: 'webp', extensions: ['webp'] },
} as const;
export type ImageMimeType = keyof typeof IMAGE_TYPES;

/** Detects the real type from the file's first bytes, ignoring what the client claims. */
export function detectImageType(data: Buffer): ImageMimeType | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff)
    return 'image/jpeg';
  if (
    data.length >= 8 &&
    data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return 'image/png';
  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString('latin1') === 'RIFF' &&
    data.subarray(8, 12).toString('latin1') === 'WEBP'
  )
    return 'image/webp';
  return null;
}

export class UploadValidationError extends Error {
  code: string;
  constructor(message: string, code = 'UPLOAD_INVALID') {
    super(message);
    this.code = code;
    this.name = 'UploadValidationError';
  }
}

/**
 * Accepts a file only when the declared MIME type, the extension and the actual signature all
 * agree on one allowed image type.
 */
export function validateImage(
  data: Buffer,
  declaredMimeType: string,
  originalName: string,
): ImageMimeType {
  const detected = detectImageType(data);
  if (!detected)
    throw new UploadValidationError('Only JPG, PNG or WebP photos can be uploaded.', 'FILE_TYPE');
  const declared = declaredMimeType.split(';')[0]!.trim().toLowerCase();
  const extension = originalName.toLowerCase().split('.').pop() ?? '';
  const allowedExtensions: readonly string[] = IMAGE_TYPES[detected].extensions;
  if (declared !== detected || !allowedExtensions.includes(extension))
    throw new UploadValidationError(
      'The file type does not match its contents. Upload an unmodified JPG, PNG or WebP photo.',
      'FILE_TYPE_MISMATCH',
    );
  return detected;
}

/** Display-safe filename: no path parts, control characters, or quotes; bounded length. */
export function safeDisplayName(originalName: string): string {
  const base = originalName.split(/[\\/]/).pop() ?? 'photo';
  const cleaned = base.replace(/[\u0000-\u001f\u007f"<>]/g, '').trim();
  return (cleaned || 'photo').slice(-120);
}
