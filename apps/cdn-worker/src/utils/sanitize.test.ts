import { describe, expect, it } from 'vitest';
import { sanitizeKey } from './sanitize';

describe('sanitizeKey', () => {
  it('passes a plain nested key through unchanged', () => {
    expect(sanitizeKey('private/videos/abc/v1/hls/master.m3u8')).toBe(
      'private/videos/abc/v1/hls/master.m3u8',
    );
  });

  it('decodes percent-encoded segments', () => {
    expect(sanitizeKey('public/my%20photo.png')).toBe('public/my photo.png');
  });

  it.each([
    ['parent traversal', 'private/../secret'],
    ['encoded traversal', 'private/%2e%2e/secret'],
    ['current-dir segment', 'private/./secret'],
    ['absolute path', '/etc/passwd'],
    ['empty segment', 'private//secret'],
    ['backslash', 'private\\secret'],
    ['null byte', 'private/a%00b'],
    ['malformed encoding', 'private/%E0%A4%A'],
    ['empty key', ''],
    ['null key', null],
  ])('rejects %s', (_label, key) => {
    expect(sanitizeKey(key)).toBeNull();
  });

  it('rejects keys longer than the limit', () => {
    expect(sanitizeKey('a'.repeat(1025))).toBeNull();
    expect(sanitizeKey('a'.repeat(1024))).toHaveLength(1024);
  });
});
