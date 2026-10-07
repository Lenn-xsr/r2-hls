/**
 * Private file handler with signed URL validation
 */

import type { Env } from '../types/env';
import { AUTH_FAILURE_DELAY_MS } from '../config/security';
import { validateSignedUrl } from '../services/signed-url.service';
import { serveFile } from '../services/r2.service';
import { addCorsHeaders, errorResponse } from '../utils/response';

/**
 * Handle private file requests (requires valid signed URL)
 *
 * @param request - Incoming HTTP request
 * @param pathname - Request pathname
 * @param env - Worker environment bindings
 * @param corsOrigin - CORS origin to include in response
 * @returns Response with private file or error
 */
export async function handlePrivateFile(
  request: Request,
  pathname: string,
  env: Env,
  corsOrigin: string | null,
): Promise<Response> {
  // Validate signed URL
  const authResult = await validateSignedUrl(request, env, pathname);

  if (!authResult.valid) {
    // Delay response to prevent timing attacks
    await new Promise((resolve) => setTimeout(resolve, AUTH_FAILURE_DELAY_MS));
    return errorResponse(authResult.error || 'Unauthorized', 401);
  }

  // Serve the file using the validated key with private/ prefix for R2
  const r2Key = `private/${authResult.key!}`;
  const response = await serveFile(env, r2Key, true);
  return addCorsHeaders(response, corsOrigin);
}
