/**
 * Public file handler
 */

import type { Env } from '../types/env';
import { serveFile } from '../services/r2.service';
import { addCorsHeaders } from '../utils/response';

/**
 * Handle public file requests (no authentication required)
 *
 * @param pathname - Request pathname
 * @param env - Worker environment bindings
 * @param corsOrigin - CORS origin to include in response
 * @returns Response with public file
 */
export async function handlePublicFile(
  pathname: string,
  env: Env,
  corsOrigin: string | null,
): Promise<Response> {
  const key = pathname.slice(1); // Remove leading "/" to get "public/..."
  const response = await serveFile(env, key, false);
  return addCorsHeaders(response, corsOrigin);
}
