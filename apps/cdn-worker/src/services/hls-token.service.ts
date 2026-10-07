/**
 * HLS prefix token validation service
 *
 * Tokens authorize access to every object under a single delivery prefix:
 *   private/videos/{videoId}/v{version}/
 *
 * Token format: `{expires}.{hmacHex}`
 * Signed data:  `prefix:private/videos/{videoId}/v{version}/:{expires}`
 * HMAC-SHA256 keyed with HLS_TOKEN_SECRET (separate from SIGNED_URL_SECRET).
 */

import type { Env } from '../types/env';
import { MAX_EXPIRATION_SECONDS } from '../config/security';
import { timingSafeEqual, bufferToHex } from '../utils/crypto';

export interface HlsTokenValidationResult {
  valid: boolean;
  error?: string;
}

export async function validateHlsToken(
  env: Env,
  token: string,
  prefix: string,
): Promise<HlsTokenValidationResult> {
  const secret = env.HLS_TOKEN_SECRET;
  if (!secret) {
    console.error('HLS_TOKEN_SECRET not configured');
    return { valid: false, error: 'Server configuration error' };
  }

  const separatorIndex = token.indexOf('.');
  if (separatorIndex <= 0) {
    return { valid: false, error: 'Invalid token format' };
  }

  const expires = token.slice(0, separatorIndex);
  const signature = token.slice(separatorIndex + 1);

  const expiresTimestamp = parseInt(expires, 10);
  if (isNaN(expiresTimestamp)) {
    return { valid: false, error: 'Invalid expiration format' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (expiresTimestamp < now) {
    return { valid: false, error: 'Token has expired' };
  }

  if (expiresTimestamp > now + MAX_EXPIRATION_SECONDS) {
    return { valid: false, error: 'Invalid expiration time' };
  }

  if (!/^[a-f0-9]{64}$/i.test(signature)) {
    return { valid: false, error: 'Invalid signature format' };
  }

  const dataToSign = `prefix:${prefix}:${expires}`;

  try {
    const encoder = new TextEncoder();
    const secretKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );

    const signatureBuffer = await crypto.subtle.sign(
      'HMAC',
      secretKey,
      encoder.encode(dataToSign),
    );

    const expectedSignature = bufferToHex(signatureBuffer);

    if (
      !timingSafeEqual(signature.toLowerCase(), expectedSignature.toLowerCase())
    ) {
      return { valid: false, error: 'Invalid signature' };
    }

    return { valid: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('HLS token validation error:', message);
    return { valid: false, error: 'Token validation failed' };
  }
}
