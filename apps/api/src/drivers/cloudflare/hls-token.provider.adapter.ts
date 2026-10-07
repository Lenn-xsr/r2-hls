import { createHmac } from 'crypto';
import { hlsDeliveryPrefix } from '@r2-hls/contracts';
import { HlsTokenProviderPort } from 'src/application/ports/hls-token.provider.port';

const DEFAULT_TTL_SECONDS = 1800;
// The signed-URL expiry is snapped to this window so every viewer of the same
// video within the window gets an IDENTICAL URL — which lets Cloudflare's edge
// cache master.m3u8 + init + segments ACROSS users, instead of a per-request
// cache-miss to the cold R2 origin. The bucket is clamped to half the TTL, so
// effective validity is always at least ttl/2.
const DEFAULT_BUCKET_SECONDS = 300;

export class HlsTokenProviderAdapter implements HlsTokenProviderPort {
  private readonly secret: string;
  private readonly defaultTtl: number;
  private readonly bucketSeconds: number;

  constructor() {
    const secret = process.env.HLS_TOKEN_SECRET;

    if (!secret) {
      throw new Error(
        'HlsTokenProviderAdapter: HLS_TOKEN_SECRET env var is required',
      );
    }

    this.secret = secret;
    this.defaultTtl = Number(
      process.env.HLS_TOKEN_TTL_SECONDS ?? DEFAULT_TTL_SECONDS,
    );
    this.bucketSeconds = Number(
      process.env.HLS_TOKEN_BUCKET_SECONDS ?? DEFAULT_BUCKET_SECONDS,
    );
  }

  generate(videoId: string, version: number, ttlSeconds?: number): string {
    const ttl = ttlSeconds ?? this.defaultTtl;
    const nowSec = Math.floor(Date.now() / 1000);
    // Quantize `expires` to a fixed grid so the token (and thus the URL) is
    // stable within the window → edge-cacheable. Verification is unaffected: it
    // still just checks the HMAC over `expires` and that `expires > now`.
    const bucket = Math.max(
      1,
      Math.min(this.bucketSeconds, Math.floor(ttl / 2)),
    );
    const expires = Math.floor(nowSec / bucket) * bucket + ttl;

    const prefix = `${hlsDeliveryPrefix(videoId, version)}/`;
    const dataToSign = `prefix:${prefix}:${expires}`;

    const signature = createHmac('sha256', this.secret)
      .update(dataToSign)
      .digest('hex');

    return `${expires}.${signature}`;
  }
}
