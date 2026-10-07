/**
 * Health check handler
 */

import { createResponse } from '../utils/response';

/**
 * Handle health check requests
 *
 * @returns JSON response indicating service status
 */
export function handleHealth(): Response {
  return createResponse(
    JSON.stringify({ status: 'ok' }),
    200,
    'application/json',
  );
}
