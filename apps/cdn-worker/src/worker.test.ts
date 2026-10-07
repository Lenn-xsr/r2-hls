import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker from './worker';
import type { Env } from './types/env';

const HLS_SECRET = 'hls-secret';
const SIGNED_URL_SECRET = 'signed-url-secret';
const ORIGIN = 'https://media.example.com';
const PREFIX = 'private/videos/abc/v1/';

/**
 * Mints tokens exactly like the API does (HlsTokenProviderAdapter): this is the
 * contract the two services share — `{expires}.{hmac("prefix:{prefix}:{expires}")}`.
 */
function hlsToken(
  prefix: string,
  { expiresIn = 600, secret = HLS_SECRET } = {},
): string {
  const expires = Math.floor(Date.now() / 1000) + expiresIn;
  const signature = createHmac('sha256', secret)
    .update(`prefix:${prefix}:${expires}`)
    .digest('hex');
  return `${expires}.${signature}`;
}

/** Signs `/private/{key}` like the API's SignedUrlGenerator. */
function signedUrl(key: string, expiresIn = 600): string {
  const expires = Math.floor(Date.now() / 1000) + expiresIn;
  const signature = createHmac('sha256', SIGNED_URL_SECRET)
    .update(`/private/${key}:${expires}`)
    .digest('hex');
  return `${ORIGIN}/private/${key}?expires=${expires}&signature=${signature}`;
}

/** Minimal in-memory stand-in for the R2 bucket binding. */
class FakeBucket {
  readonly gets: string[] = [];
  private readonly objects = new Map<string, Uint8Array>();

  put(key: string, content: string): void {
    this.objects.set(key, new TextEncoder().encode(content));
  }

  head(key: string) {
    const bytes = this.objects.get(key);
    return Promise.resolve(
      bytes ? { size: bytes.length, etag: `etag-${key}` } : null,
    );
  }

  get(key: string, options?: { range?: { offset: number; length: number } }) {
    this.gets.push(key);
    const bytes = this.objects.get(key);
    if (!bytes) return Promise.resolve(null);

    const range = options?.range;
    const body = range
      ? bytes.slice(range.offset, range.offset + range.length)
      : bytes;

    return Promise.resolve({
      body,
      size: bytes.length,
      etag: `etag-${key}`,
      httpMetadata: { contentType: 'image/png' },
    });
  }
}

/** Stand-in for the Workers `caches.default` edge cache. */
class FakeCache {
  private readonly entries = new Map<string, Response>();

  get keys(): string[] {
    return [...this.entries.keys()];
  }

  match(request: Request) {
    return Promise.resolve(this.entries.get(request.url)?.clone());
  }

  put(request: Request, response: Response) {
    this.entries.set(request.url, response);
    return Promise.resolve();
  }
}

let bucket: FakeBucket;
let cache: FakeCache;
let env: Env;

const call = (url: string, init?: RequestInit) =>
  worker.fetch(new Request(url, init), env, {} as ExecutionContext);

const hlsUrl = (token: string, rest = 'hls/master.m3u8') =>
  `${ORIGIN}/v/abc/${token}/v1/${rest}`;

beforeEach(() => {
  bucket = new FakeBucket();
  cache = new FakeCache();
  vi.stubGlobal('caches', { default: cache });
  env = {
    R2_BUCKET: bucket as unknown as R2Bucket,
    HLS_TOKEN_SECRET: HLS_SECRET,
    SIGNED_URL_SECRET,
  };

  bucket.put(`${PREFIX}hls/master.m3u8`, '#EXTM3U\n360p/index.m3u8\n');
  bucket.put(`${PREFIX}hls/360p/seg_00000.m4s`, '0123456789');
  bucket.put('private/docs/contract.pdf', 'pdf-bytes');
  bucket.put('public/logo.png', 'png-bytes');
});

describe('routing', () => {
  it('answers the health check', async () => {
    const response = await call(`${ORIGIN}/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('only allows read methods', async () => {
    const response = await call(`${ORIGIN}/public/logo.png`, { method: 'POST' });

    expect(response.status).toBe(405);
  });

  it('answers 404 outside the known route prefixes', async () => {
    expect((await call(`${ORIGIN}/anything/else`)).status).toBe(404);
  });

  it('answers CORS preflights without touching storage', async () => {
    const response = await call(hlsUrl('x'), {
      method: 'OPTIONS',
      headers: { Origin: 'https://app.example.com' },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://app.example.com',
    );
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain(
      'Range',
    );
    expect(bucket.gets).toHaveLength(0);
  });

  it('restricts CORS to ALLOWED_ORIGINS when configured', async () => {
    env.ALLOWED_ORIGINS = 'https://app.example.com';

    const allowed = await call(`${ORIGIN}/public/logo.png`, {
      headers: { Origin: 'https://app.example.com' },
    });
    const denied = await call(`${ORIGIN}/public/logo.png`, {
      headers: { Origin: 'https://evil.example.com' },
    });

    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://app.example.com',
    );
    expect(denied.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('HLS delivery (/v/{videoId}/{token}/v{version}/…)', () => {
  it('serves a playlist for a valid prefix token', async () => {
    const response = await call(hlsUrl(hlsToken(PREFIX)));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe(
      'application/vnd.apple.mpegurl',
    );
    expect(response.headers.get('Cache-Control')).toBe(
      'public, max-age=31536000, immutable',
    );
    expect(await response.text()).toBe('#EXTM3U\n360p/index.m3u8\n');
    expect(bucket.gets).toEqual([`${PREFIX}hls/master.m3u8`]);
  });

  it('lets the same token fetch every object under the version prefix', async () => {
    const token = hlsToken(PREFIX);

    const segment = await call(hlsUrl(token, 'hls/360p/seg_00000.m4s'));

    expect(segment.status).toBe(200);
    expect(segment.headers.get('Content-Type')).toBe('video/iso.segment');
    expect(await segment.text()).toBe('0123456789');
  });

  it('caches under a token-less key, so a rotated token still hits the cache', async () => {
    await call(hlsUrl(hlsToken(PREFIX, { expiresIn: 600 })));
    const second = await call(hlsUrl(hlsToken(PREFIX, { expiresIn: 900 })));

    expect(second.status).toBe(200);
    expect(await second.text()).toBe('#EXTM3U\n360p/index.m3u8\n');
    expect(bucket.gets).toHaveLength(1);
    expect(cache.keys).toEqual([`${ORIGIN}/${PREFIX}hls/master.m3u8`]);
  });

  it('still authenticates requests that would be cache hits', async () => {
    await call(hlsUrl(hlsToken(PREFIX)));

    const response = await call(hlsUrl(hlsToken(PREFIX, { secret: 'wrong' })));

    expect(response.status).toBe(401);
  });

  it('rejects an expired token', async () => {
    const response = await call(hlsUrl(hlsToken(PREFIX, { expiresIn: -10 })));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Token has expired' });
    expect(bucket.gets).toHaveLength(0);
  });

  it('rejects a token whose lifetime exceeds the 24h ceiling', async () => {
    const response = await call(
      hlsUrl(hlsToken(PREFIX, { expiresIn: 86_400 + 600 })),
    );

    expect(response.status).toBe(401);
  });

  it('rejects a token minted for another video or another version', async () => {
    const otherVideo = hlsToken('private/videos/xyz/v1/');
    const otherVersion = hlsToken('private/videos/abc/v2/');

    expect((await call(hlsUrl(otherVideo))).status).toBe(401);
    expect((await call(hlsUrl(otherVersion))).status).toBe(401);
  });

  it('rejects a tampered expiry', async () => {
    const [expires, signature] = hlsToken(PREFIX).split('.');
    const forged = `${Number(expires) + 60}.${signature}`;

    expect((await call(hlsUrl(forged))).status).toBe(401);
  });

  it('refuses path traversal even with a valid token', async () => {
    const response = await call(
      `${ORIGIN}/v/abc/${hlsToken(PREFIX)}/v1/hls/%2e%2e/%2e%2e/secret.txt`,
    );

    expect(response.status).toBe(400);
    expect(bucket.gets).toHaveLength(0);
  });

  it('answers 404 for a missing object and 400 for a malformed path', async () => {
    const token = hlsToken(PREFIX);

    expect((await call(hlsUrl(token, 'hls/nope.m3u8'))).status).toBe(404);
    expect((await call(`${ORIGIN}/v/abc/${token}`)).status).toBe(400);
    expect((await call(`${ORIGIN}/v/abc/${token}/latest/x.m3u8`)).status).toBe(
      400,
    );
  });

  it('serves byte ranges straight from R2 without caching them', async () => {
    const response = await call(
      hlsUrl(hlsToken(PREFIX), 'hls/360p/seg_00000.m4s'),
      { headers: { Range: 'bytes=2-5' } },
    );

    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Range')).toBe('bytes 2-5/10');
    expect(response.headers.get('Content-Length')).toBe('4');
    expect(await response.text()).toBe('2345');
    expect(cache.keys).toHaveLength(0);
  });

  it('supports open-ended and suffix ranges', async () => {
    const url = hlsUrl(hlsToken(PREFIX), 'hls/360p/seg_00000.m4s');

    const openEnded = await call(url, { headers: { Range: 'bytes=7-' } });
    const suffix = await call(url, { headers: { Range: 'bytes=-3' } });

    expect(await openEnded.text()).toBe('789');
    expect(await suffix.text()).toBe('789');
    expect(suffix.headers.get('Content-Range')).toBe('bytes 7-9/10');
  });

  it('answers 416 for a range outside the object', async () => {
    const response = await call(
      hlsUrl(hlsToken(PREFIX), 'hls/360p/seg_00000.m4s'),
      { headers: { Range: 'bytes=50-60' } },
    );

    expect(response.status).toBe(416);
    expect(response.headers.get('Content-Range')).toBe('bytes */10');
  });

  it('answers HEAD with headers only', async () => {
    const response = await call(hlsUrl(hlsToken(PREFIX)), { method: 'HEAD' });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Length')).toBe('24');
    expect(await response.text()).toBe('');
  });
});

describe('private files (/private/{key}?expires&signature)', () => {
  it('serves a file for a valid signed URL and forbids caching it', async () => {
    const response = await call(signedUrl('docs/contract.pdf'));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('pdf-bytes');
    expect(response.headers.get('Cache-Control')).toContain('no-store');
  });

  it('rejects a missing, expired or mismatched signature', async () => {
    const valid = signedUrl('docs/contract.pdf');

    expect((await call(`${ORIGIN}/private/docs/contract.pdf`)).status).toBe(401);
    expect((await call(signedUrl('docs/contract.pdf', -10))).status).toBe(401);
    expect(
      (await call(valid.replace('contract.pdf', 'other.pdf'))).status,
    ).toBe(401);
    expect(bucket.gets).toHaveLength(0);
  });
});

describe('public files (/public/…)', () => {
  it('serves without authentication and with a shared cache lifetime', async () => {
    const response = await call(`${ORIGIN}/public/logo.png`);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('png-bytes');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('answers 404 for a missing file', async () => {
    expect((await call(`${ORIGIN}/public/missing.png`)).status).toBe(404);
  });
});
