/**
 * Input sanitization utilities
 */

import { MAX_KEY_LENGTH } from '../config/security';

/**
 * Sanitize and validate file key to prevent path traversal and injection attacks
 *
 * Security checks:
 * - Prevents path traversal (../, ./, //, \\)
 * - Blocks null bytes and control characters
 * - Validates length constraints
 * - Normalizes path segments
 *
 * @param key - File key from URL path
 * @returns Sanitized key or null if invalid
 */
export function sanitizeKey(key: string | null): string | null {
  if (!key || typeof key !== 'string') {
    return null;
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(key);
  } catch {
    return null;
  }

  // Block path traversal attempts
  if (
    decoded.includes('..') ||
    decoded.includes('./') ||
    decoded.startsWith('/') ||
    decoded.includes('//') ||
    decoded.includes('\\')
  ) {
    return null;
  }

  // Block null bytes and other control characters
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(decoded)) {
    return null;
  }

  // Normalize and clean the path
  const sanitized = decoded
    .split('/')
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .join('/');

  // Ensure we have a valid key
  if (
    !sanitized ||
    sanitized.length === 0 ||
    sanitized.length > MAX_KEY_LENGTH
  ) {
    return null;
  }

  return sanitized;
}
