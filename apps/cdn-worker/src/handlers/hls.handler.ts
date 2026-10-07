/**
 * HLS delivery handler with prefix-token validation.
 *
 * Route shape: /v/{videoId}/{token}/v{version}/{rest...}
 *   -> R2 key: private/videos/{videoId}/v{version}/{rest...}
 *
 * The token (placed before v{version}/) authorizes the whole version prefix,
 * so relative segments inside the playlists inherit it automatically.
 *
 * Caching: full-object responses are cached in caches.default under a CLEAN
 * key (without the token), preserving edge cache across rotating tokens.
 * Range/206 responses are served straight from R2 and never cached.
 */

import type { Env } from '../types/env';
import { AUTH_FAILURE_DELAY_MS } from '../config/security';
import { validateHlsToken } from '../services/hls-token.service';
import { sanitizeKey } from '../utils/sanitize';
import {
  addCorsHeaders,
  errorResponse,
  createResponse,
} from '../utils/response';

interface ParsedHlsPath {
  videoId: string;
  token: string;
  version: string;
  rest: string;
}

function parseHlsPath(pathname: string): ParsedHlsPath | null {
  // /v/{videoId}/{token}/v{version}/{rest...}
  const withoutPrefix = pathname.slice('/v/'.length);
  const segments = withoutPrefix.split('/');

  if (segments.length < 4) {
    return null;
  }

  const [videoId, token, version, ...restParts] = segments;
  const rest = restParts.join('/');

  if (!videoId || !token || !version || !/^v\d+$/.test(version) || !rest) {
    return null;
  }

  return { videoId, token, version, rest };
}

function getContentType(key: string): string {
  if (key.endsWith('.m3u8')) return 'application/vnd.apple.mpegurl';
  if (key.endsWith('.m4s')) return 'video/iso.segment';
  if (key.endsWith('.mp4')) return 'video/mp4';
  if (key.endsWith('.webp')) return 'image/webp';
  if (key.endsWith('.ts')) return 'video/mp2t';
  return 'application/octet-stream';
}

function parseRangeHeader(
  rangeHeader: string,
  size: number,
): { offset: number; length: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) {
    return null;
  }

  const startRaw = match[1];
  const endRaw = match[2];

  let start: number;
  let end: number;

  if (startRaw === '') {
    // suffix range: last N bytes
    const suffix = parseInt(endRaw, 10);
    if (isNaN(suffix) || suffix === 0) return null;
    start = Math.max(size - suffix, 0);
    end = size - 1;
  } else {
    start = parseInt(startRaw, 10);
    end = endRaw === '' ? size - 1 : parseInt(endRaw, 10);
  }

  if (isNaN(start) || isNaN(end) || start > end || start >= size) {
    return null;
  }

  end = Math.min(end, size - 1);
  return { offset: start, length: end - start + 1, end };
}

export async function handleHlsFile(
  request: Request,
  pathname: string,
  env: Env,
  corsOrigin: string | null,
): Promise<Response> {
  const parsed = parseHlsPath(pathname);

  if (!parsed) {
    return addCorsHeaders(errorResponse('Invalid HLS path', 400), corsOrigin);
  }

  const { videoId, token, version, rest } = parsed;
  const prefix = `private/videos/${videoId}/${version}/`;

  const authResult = await validateHlsToken(env, token, prefix);
  if (!authResult.valid) {
    await new Promise((resolve) => setTimeout(resolve, AUTH_FAILURE_DELAY_MS));
    return addCorsHeaders(
      errorResponse(authResult.error || 'Unauthorized', 401),
      corsOrigin,
    );
  }

  const cleanKey = sanitizeKey(`${prefix}${rest}`);
  if (!cleanKey) {
    return addCorsHeaders(errorResponse('Invalid file path', 400), corsOrigin);
  }

  const rangeHeader = request.headers.get('Range');
  const contentType = getContentType(cleanKey);

  // Range requests: serve a partial response directly from R2, never cached.
  if (rangeHeader) {
    return addCorsHeaders(
      await serveRange(env, cleanKey, rangeHeader, contentType, request.method),
      corsOrigin,
    );
  }

  // Full-object requests: use the edge cache keyed by the clean (token-less) URL.
  const cache = caches.default;
  const cacheUrl = new URL(request.url);
  cacheUrl.pathname = `/${cleanKey}`;
  cacheUrl.search = '';
  const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });

  const cached = await cache.match(cacheKey);
  if (cached) {
    const response =
      request.method === 'HEAD'
        ? new Response(null, { status: cached.status, headers: cached.headers })
        : cached;
    return addCorsHeaders(response, corsOrigin);
  }

  const object = await env.R2_BUCKET.get(cleanKey);
  if (!object) {
    return addCorsHeaders(errorResponse('File not found', 404), corsOrigin);
  }

  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Content-Length': object.size.toString(),
    ETag: object.etag,
    'Accept-Ranges': 'bytes',
    'Content-Disposition': 'inline',
    'Cache-Control': 'public, max-age=31536000, immutable',
  };

  const cacheableResponse = createResponse(object.body, 200, null, headers);

  // Store a clone in the edge cache under the clean key.
  await cache.put(cacheKey, cacheableResponse.clone());

  if (request.method === 'HEAD') {
    return addCorsHeaders(
      new Response(null, { status: 200, headers }),
      corsOrigin,
    );
  }

  return addCorsHeaders(cacheableResponse, corsOrigin);
}

async function serveRange(
  env: Env,
  key: string,
  rangeHeader: string,
  contentType: string,
  method: string,
): Promise<Response> {
  const head = await env.R2_BUCKET.head(key);
  if (!head) {
    return errorResponse('File not found', 404);
  }

  const range = parseRangeHeader(rangeHeader, head.size);

  if (!range) {
    return createResponse(null, 416, null, {
      'Content-Range': `bytes */${head.size}`,
      'Accept-Ranges': 'bytes',
    });
  }

  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Content-Length': range.length.toString(),
    'Content-Range': `bytes ${range.offset}-${range.end}/${head.size}`,
    'Accept-Ranges': 'bytes',
    ETag: head.etag,
    'Content-Disposition': 'inline',
    'Cache-Control': 'public, max-age=31536000, immutable',
  };

  if (method === 'HEAD') {
    return createResponse(null, 206, null, headers);
  }

  const object = await env.R2_BUCKET.get(key, {
    range: { offset: range.offset, length: range.length },
  });

  if (!object) {
    return errorResponse('File not found', 404);
  }

  return createResponse(object.body, 206, null, headers);
}
