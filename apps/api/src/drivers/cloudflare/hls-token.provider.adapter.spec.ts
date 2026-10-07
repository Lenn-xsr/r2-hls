import { createHmac } from 'crypto';
import { HlsTokenProviderAdapter } from './hls-token.provider.adapter';

const SECRET = 'test-hls-secret';
// A timestamp that sits exactly on a 300s bucket boundary.
const BUCKET_START_MS = 1_800_000_000 * 1000;

describe('HlsTokenProviderAdapter', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(BUCKET_START_MS);
    process.env.HLS_TOKEN_SECRET = SECRET;
    delete process.env.HLS_TOKEN_TTL_SECONDS;
    delete process.env.HLS_TOKEN_BUCKET_SECONDS;
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env = { ...envBackup };
  });

  it('refuses to start without a secret', () => {
    delete process.env.HLS_TOKEN_SECRET;

    expect(() => new HlsTokenProviderAdapter()).toThrow(/HLS_TOKEN_SECRET/);
  });

  it('signs the version prefix with HMAC-SHA256 as `{expires}.{hex}`', () => {
    const token = new HlsTokenProviderAdapter().generate('abc', 2);

    const [expires, signature] = token.split('.');
    const expected = createHmac('sha256', SECRET)
      .update(`prefix:private/videos/abc/v2/:${expires}`)
      .digest('hex');

    expect(signature).toBe(expected);
    expect(signature).toMatch(/^[a-f0-9]{64}$/);
  });

  it('expires one TTL after the start of the current bucket', () => {
    const token = new HlsTokenProviderAdapter().generate('abc', 1);

    expect(Number(token.split('.')[0])).toBe(1_800_000_000 + 1800);
  });

  it('returns the identical token to every caller inside one bucket', () => {
    const provider = new HlsTokenProviderAdapter();

    const first = provider.generate('abc', 1);
    jest.setSystemTime(BUCKET_START_MS + 299_000);
    const last = provider.generate('abc', 1);

    expect(last).toBe(first);
  });

  it('rotates the token when the bucket rolls over', () => {
    const provider = new HlsTokenProviderAdapter();

    const first = provider.generate('abc', 1);
    jest.setSystemTime(BUCKET_START_MS + 300_000);
    const next = provider.generate('abc', 1);

    expect(next).not.toBe(first);
    expect(Number(next.split('.')[0])).toBe(1_800_000_300 + 1800);
  });

  it('never hands out a token with less than half the TTL left', () => {
    const provider = new HlsTokenProviderAdapter();

    // 60s TTL would be shorter than the default 300s bucket, so the bucket is
    // clamped to ttl/2 = 30s. Probe the worst case: 1s before a bucket ends.
    jest.setSystemTime(BUCKET_START_MS + 29_000);
    const token = provider.generate('abc', 1, 60);

    const remaining = Number(token.split('.')[0]) - (1_800_000_000 + 29);
    expect(remaining).toBeGreaterThanOrEqual(30);
    expect(remaining).toBeLessThanOrEqual(60);
  });

  it('scopes tokens to a single video and version', () => {
    const provider = new HlsTokenProviderAdapter();

    const base = provider.generate('abc', 1);

    expect(provider.generate('abc', 2)).not.toBe(base);
    expect(provider.generate('xyz', 1)).not.toBe(base);
  });
});
