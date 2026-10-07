/**
 * Security configuration and constants
 */

/**
 * Security headers applied to all responses
 */
export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
};

/**
 * Allowed HTTP methods for file requests
 */
export const ALLOWED_METHODS: string[] = ['GET', 'HEAD', 'OPTIONS'];

/**
 * CORS headers for preflight and responses
 */
export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Range',
  'Access-Control-Expose-Headers':
    'Content-Length, Content-Range, Accept-Ranges, ETag',
  'Access-Control-Max-Age': '86400',
};

/**
 * Maximum URL expiration time (24 hours in seconds)
 * Prevents abuse of signed URLs with unrealistic expiration times
 */
export const MAX_EXPIRATION_SECONDS = 86400;

/**
 * Maximum allowed file key length
 */
export const MAX_KEY_LENGTH = 1024;

/**
 * Delay in milliseconds for failed authentication attempts
 * Helps prevent timing attacks and brute force attempts
 */
export const AUTH_FAILURE_DELAY_MS = 100;
