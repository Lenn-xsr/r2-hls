import { MediaResolverProviderAdapter } from './media-resolver.provider.adapter';
import { makeImageMedia, makeVideoMedia } from 'src/testing/fakes';

describe('MediaResolverProviderAdapter', () => {
  const envBackup = { ...process.env };

  const resolver = new MediaResolverProviderAdapter(
    { generateSignedUrl: (key, ttl) => `signed:${key}:${ttl}` },
    { generate: (videoId, version) => `token-${videoId}-${version}` },
  );

  beforeEach(() => {
    process.env.R2_PUBLIC_URL = 'https://media.example.com';
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('puts the token in the path, before the version, for a ready video', () => {
    const media = makeVideoMedia(
      { status: 'ready', version: 3 },
      { id: 'abc' },
    );

    expect(resolver.resolveMedia(media)).toEqual({
      id: 'abc',
      type: 'video',
      thumbnail: 'https://media.example.com/v/abc/token-abc-3/v3/poster.webp',
      playback: {
        hls: 'https://media.example.com/v/abc/token-abc-3/v3/hls/master.m3u8',
      },
    });
  });

  it.each(['pending', 'processing', 'failed'] as const)(
    'does not expose a %s video',
    (status) => {
      expect(resolver.resolveMedia(makeVideoMedia({ status }))).toBeNull();
    },
  );

  it('does not expose hidden media', () => {
    const media = makeVideoMedia({ status: 'ready' }, { hidden: true });

    expect(resolver.resolveMedia(media)).toBeNull();
  });

  it('serves public/ images from a permanent, unsigned URL', () => {
    const media = makeImageMedia('public/covers/a.png', { id: 'img' });

    expect(resolver.resolveMedia(media)).toEqual({
      id: 'img',
      type: 'image',
      url: 'https://media.example.com/public/covers/a.png',
    });
  });

  it('serves any other image through a short-lived signed URL', () => {
    const media = makeImageMedia('private/avatars/a.png', { id: 'img' });

    expect(resolver.resolveMedia(media)).toEqual({
      id: 'img',
      type: 'image',
      url: 'signed:private/avatars/a.png:600',
    });
  });
});
