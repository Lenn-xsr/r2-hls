/**
 * HTTP response utilities
 */

import { SECURITY_HEADERS } from '../config/security';

/**
 * Create a secure response with proper headers
 *
 * @param body - Response body
 * @param status - HTTP status code
 * @param contentType - Content-Type header value
 * @param additionalHeaders - Additional headers to include
 * @returns Response with security headers
 */
export function createResponse(
  body: BodyInit | null,
  status: number,
  contentType?: string | null,
  additionalHeaders: Record<string, string> = {},
): Response {
  const headers: Record<string, string> = {
    ...SECURITY_HEADERS,
    ...additionalHeaders,
  };

  if (contentType) {
    headers['Content-Type'] = contentType;
  }

  return new Response(body, { status, headers });
}

/**
 * Create a JSON error response
 *
 * @param message - Error message
 * @param status - HTTP status code
 * @returns JSON response with error
 */
export function errorResponse(message: string, status: number): Response {
  return createResponse(
    JSON.stringify({ error: message }),
    status,
    'application/json',
  );
}

/**
 * Add CORS headers to an existing response
 *
 * @param response - Original response
 * @param corsOrigin - Allowed origin for CORS
 * @returns Response with CORS headers added
 */
export function addCorsHeaders(
  response: Response,
  corsOrigin: string | null,
): Response {
  if (corsOrigin) {
    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', corsOrigin);
    return new Response(response.body, {
      status: response.status,
      headers,
    });
  }
  return response;
}
