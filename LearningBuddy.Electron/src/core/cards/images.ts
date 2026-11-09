// Card images: standard base64 PNG or JPEG of 1 byte to 4 MiB (v1 CardImageValidator).

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
/** Longest base64 text that can encode MAX_IMAGE_BYTES. */
export const MAX_IMAGE_BASE64_LENGTH = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;

export type ImageMimeType = 'image/png' | 'image/jpeg';

const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

export function isValidBase64(value: string): boolean {
  return value.length > 0 && BASE64_PATTERN.test(value);
}

export function decodedLength(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return (base64.length / 4) * 3 - padding;
}

/** Format of a base64 image, read from its first bytes; null when it is neither PNG nor JPEG. */
export function imageMimeType(base64: string): ImageMimeType | null {
  const header = decodeBase64Prefix(base64.slice(0, 12));
  if (startsWith(header, PNG_SIGNATURE)) {
    return 'image/png';
  }

  return startsWith(header, JPEG_SIGNATURE) ? 'image/jpeg' : null;
}

export type ImageProblem = 'encoding' | 'size' | 'format';

/** Returns what is wrong with an image, or null when it can be stored. */
export function checkImage(base64: string): ImageProblem | null {
  if (base64.length > MAX_IMAGE_BASE64_LENGTH) {
    return 'size';
  }

  if (!isValidBase64(base64)) {
    return 'encoding';
  }

  const length = decodedLength(base64);
  if (length < 1 || length > MAX_IMAGE_BYTES) {
    return 'size';
  }

  return imageMimeType(base64) ? null : 'format';
}

export function imageDataUrl(base64: string | null): string | null {
  const mime = base64 ? imageMimeType(base64) : null;
  return base64 && mime ? `data:${mime};base64,${base64}` : null;
}

function decodeBase64Prefix(value: string): number[] {
  const usable = value.slice(0, value.length - (value.length % 4));
  try {
    return [...atob(usable)].map((character) => character.charCodeAt(0));
  } catch {
    return [];
  }
}

function startsWith(bytes: readonly number[], signature: readonly number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}
