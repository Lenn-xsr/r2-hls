/**
 * CORS handler for preflight requests
 */

import type { Env } from '../types/env';
import { CORS_HEADERS } from '../config/security';

/**
 * Handle CORS preflight (OPTIONS) requests
 *
 * @param request - Incoming HTTP request
 * @param env - Worker environment bindings
 * @returns CORS preflight response
 */
export function handleCORS(request: Request, env: Env): Response {
  const origin = request.headers.get('Origin');
  const allowedOrigins = env.ALLOWED_ORIGINS?.split(',') || ['*'];

  const corsHeaders: Record<string, string> = { ...CORS_HEADERS };

  if (
    allowedOrigins.includes('*') ||
    (origin && allowedOrigins.includes(origin))
  ) {
    corsHeaders['Access-Control-Allow-Origin'] = origin || '*';
  }

  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

/**
 * Determine the CORS origin to use in response headers
 *
 * @param request - Incoming HTTP request
 * @param env - Worker environment bindings
 * @returns Allowed origin string or null
 */
export function getCorsOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get('Origin');
  const allowedOrigins = env.ALLOWED_ORIGINS?.split(',') || ['*'];

  if (
    allowedOrigins.includes('*') ||
    (origin && allowedOrigins.includes(origin))
  ) {
    return origin || '*';
  }

  return null;
}
