/**
 * R2 bucket file serving service
 */

import type { Env } from '../types/env';
import { sanitizeKey } from '../utils/sanitize';
import { createResponse, errorResponse } from '../utils/response';

/**
 * Serve a file from R2 bucket with appropriate headers
 *
 * @param env - Worker environment bindings
 * @param key - File key in R2 bucket
 * @param isPrivate - Whether this is a private file (affects caching)
 * @returns Response with file content or error
 */
export async function serveFile(
  env: Env,
  key: string,
  isPrivate: boolean,
): Promise<Response> {
  const sanitizedKey = sanitizeKey(key);

  if (!sanitizedKey) {
    return errorResponse('Invalid file path', 400);
  }

  try {
    const object = await env.R2_BUCKET.get(sanitizedKey);

    if (!object) {
      return errorResponse('File not found', 404);
    }

    const contentType =
      object.httpMetadata?.contentType || 'application/octet-stream';

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Content-Length': object.size.toString(),
      ETag: object.etag,
      'Cache-Control': isPrivate
        ? 'private, no-cache, no-store, must-revalidate'
        : 'public, max-age=3600',
    };

    // Add Content-Disposition for downloads (except media files)
    if (
      !contentType.startsWith('image/') &&
      !contentType.startsWith('video/') &&
      !contentType.startsWith('audio/')
    ) {
      const filename = sanitizedKey.split('/').pop() || 'file';
      // Sanitize filename to prevent header injection
      const safeFilename = filename.replace(/[^\w\-.]/g, '_');
      headers['Content-Disposition'] = `attachment; filename="${safeFilename}"`;
    }

    return createResponse(object.body, 200, null, headers);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching file:', errorMessage);
    return errorResponse('Internal server error', 500);
  }
}
