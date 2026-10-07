import { createHmac } from 'crypto';
import { SignedUrlGenerator } from './r2-signed-url.provider.adapter';

const SECRET = 'test-signed-url-secret';
const NOW_SECONDS = 1_800_000_000;

describe('SignedUrlGenerator', () => {
  const generator = new SignedUrlGenerator({
    baseUrl: 'https://media.example.com/',
    secret: SECRET,
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW_SECONDS * 1000);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('signs `/private/{key}:{expires}` and puts both in the query string', () => {
    const url = new URL(
      generator.generate({ key: 'docs/contract.pdf', expiresIn: 600 }),
    );

    const expires = String(NOW_SECONDS + 600);
    const expected = createHmac('sha256', SECRET)
      .update(`/private/docs/contract.pdf:${expires}`)
      .digest('hex');

    expect(url.origin + url.pathname).toBe(
      'https://media.example.com/private/docs/contract.pdf',
    );
    expect(url.searchParams.get('expires')).toBe(expires);
    expect(url.searchParams.get('signature')).toBe(expected);
  });

  it('accepts keys with or without the private/ prefix and leading slashes', () => {
    const plain = generator.generate({ key: 'a/b.png' });

    expect(generator.generate({ key: 'private/a/b.png' })).toBe(plain);
    expect(generator.generate({ key: '/a/b.png' })).toBe(plain);
  });

  it('percent-encodes each path segment but keeps the slashes', () => {
    const url = generator.generate({ key: 'user files/my photo.png' });

    expect(url).toContain('/private/user%20files/my%20photo.png?');
  });

  it('caps the lifetime at 24 hours', () => {
    const url = new URL(
      generator.generate({ key: 'a.png', expiresIn: 999_999 }),
    );

    expect(url.searchParams.get('expires')).toBe(String(NOW_SECONDS + 86_400));
  });

  it('rejects an empty key', () => {
    expect(() => generator.generate({ key: '' })).toThrow(/key is required/);
  });
});
