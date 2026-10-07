import { Media } from '@r2-hls/contracts';

export interface ResolvedMediaImage {
  id: string;
  type: 'image';
  url: string;
}

export interface ResolvedMediaVideo {
  id: string;
  type: 'video';
  thumbnail: string;
  playback: {
    hls: string;
  };
}

export type ResolvedMedia = ResolvedMediaImage | ResolvedMediaVideo;

export abstract class R2SignedUrlProviderPort {
  abstract generateSignedUrl(key: string, expiresInSeconds?: number): string;
}

/**
 * Turns a stored Media into client-facing delivery URLs. Returns null when the
 * media must not be served (hidden, or a video that is not ready yet).
 */
export abstract class MediaResolverPort {
  abstract resolveMedia(media: Media): ResolvedMedia | null;
}
