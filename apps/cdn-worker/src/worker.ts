/**
 * Cloudflare Worker - Secure R2 File Server
 * Main entry point for request handling and routing
 */

import type { Env } from './types/env';
import { ALLOWED_METHODS } from './config/security';
import { errorResponse } from './utils/response';
import { handleCORS, getCorsOrigin } from './handlers/cors.handler';
import { handleHealth } from './handlers/health.handler';
import { handlePublicFile } from './handlers/public.handler';
import { handlePrivateFile } from './handlers/private.handler';
import { handleHlsFile } from './handlers/hls.handler';

/**
 * Main worker export - handles all incoming requests
 */
export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method;

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return handleCORS(request, env);
    }

    // Validate HTTP method
    if (!ALLOWED_METHODS.includes(method)) {
      return errorResponse('Method not allowed', 405);
    }

    // Determine CORS origin for response
    const corsOrigin = getCorsOrigin(request, env);

    // Route: HLS delivery (prefix-token gated)
    if (pathname.startsWith('/v/')) {
      return handleHlsFile(request, pathname, env, corsOrigin);
    }

    // Route: Public files (no authentication)
    if (pathname.startsWith('/public/')) {
      return handlePublicFile(pathname, env, corsOrigin);
    }

    // Route: Private files (requires signed URL)
    if (pathname.startsWith('/private/')) {
      return handlePrivateFile(request, pathname, env, corsOrigin);
    }

    // Route: Health check
    if (pathname === '/health') {
      return handleHealth();
    }

    // Default: Not found
    return errorResponse('Not found', 404);
  },
};
