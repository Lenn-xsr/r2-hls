/**
 * Signed URL validation service
 */

import type { Env, ValidationResult } from '../types/env';
import { MAX_EXPIRATION_SECONDS } from '../config/security';
import { timingSafeEqual, bufferToHex } from '../utils/crypto';
import { sanitizeKey } from '../utils/sanitize';

/**
 * Validate signed URL for private files
 *
 * URL format: /private/{key}?expires={timestamp}&signature={hex}
 *
 * Validation steps:
 * 1. Check required parameters (expires, signature)
 * 2. Validate expiration timestamp
 * 3. Validate signature format (64 hex chars)
 * 4. Sanitize the file key
 * 5. Reconstruct signed data
 * 6. Generate expected signature using HMAC-SHA256
 * 7. Compare signatures using timing-safe comparison
 *
 * @param request - Incoming HTTP request
 * @param env - Worker environment bindings
 * @param pathname - URL pathname
 * @returns Validation result with key if valid
 */
export async function validateSignedUrl(
  request: Request,
  env: Env,
  pathname: string,
): Promise<ValidationResult> {
  const url = new URL(request.url);
  const expires = url.searchParams.get('expires');
  const signature = url.searchParams.get('signature');

  // Check if required parameters exist
  if (!expires || !signature) {
    return { valid: false, error: 'Missing signature parameters' };
  }

  // Validate expires is a valid number
  const expiresTimestamp = parseInt(expires, 10);
  if (isNaN(expiresTimestamp)) {
    return { valid: false, error: 'Invalid expiration format' };
  }

  // Check if URL has expired
  const now = Math.floor(Date.now() / 1000);
  if (expiresTimestamp < now) {
    return { valid: false, error: 'URL has expired' };
  }

  // Check if expiration is not too far in the future (prevent abuse)
  const maxFuture = now + MAX_EXPIRATION_SECONDS;
  if (expiresTimestamp > maxFuture) {
    return { valid: false, error: 'Invalid expiration time' };
  }

  // Validate signature format (must be 64 hex characters)
  if (!/^[a-f0-9]{64}$/i.test(signature)) {
    return { valid: false, error: 'Invalid signature format' };
  }

  // Get the secret key
  const secret = env.SIGNED_URL_SECRET;
  if (!secret) {
    console.error('SIGNED_URL_SECRET not configured');
    return { valid: false, error: 'Server configuration error' };
  }

  // Extract the key from pathname
  const key = pathname.slice(9); // Remove "/private/"
  const sanitizedKey = sanitizeKey(key);

  if (!sanitizedKey) {
    return { valid: false, error: 'Invalid file path' };
  }

  // Reconstruct the data that was signed
  // Format: /private/{sanitizedKey}:{expires}
  const dataToSign = `/private/${sanitizedKey}:${expires}`;

  try {
    // Import the secret key for HMAC
    const encoder = new TextEncoder();
    const secretKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );

    // Generate expected signature
    const signatureBuffer = await crypto.subtle.sign(
      'HMAC',
      secretKey,
      encoder.encode(dataToSign),
    );

    const expectedSignature = bufferToHex(signatureBuffer);

    // Timing-safe comparison
    if (
      !timingSafeEqual(signature.toLowerCase(), expectedSignature.toLowerCase())
    ) {
      return { valid: false, error: 'Invalid signature' };
    }

    return { valid: true, key: sanitizedKey };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error('Signature validation error:', errorMessage);
    return { valid: false, error: 'Signature validation failed' };
  }
}
