import {
  MediaResolverPort,
  ResolvedMedia,
  R2SignedUrlProviderPort,
} from 'src/application/ports/media.provider.port';
import { HlsTokenProviderPort } from 'src/application/ports/hls-token.provider.port';
import { Media } from '@r2-hls/contracts';

export class MediaResolverProviderAdapter implements MediaResolverPort {
  constructor(
    private readonly r2Provider: R2SignedUrlProviderPort,
    private readonly hlsTokenProvider: HlsTokenProviderPort,
  ) {}

  resolveMedia(media: Media): ResolvedMedia | null {
    if (media.isHidden()) {
      return null;
    }

    if (media.isR2()) {
      const isPublic = media.storageId.startsWith('public/');
      const url = isPublic
        ? `${process.env.R2_PUBLIC_URL!}/${media.storageId}`
        : this.r2Provider.generateSignedUrl(media.storageId, 600);

      return { id: media.id, type: 'image', url };
    }

    if (media.isHls()) {
      if (!media.isVideoReady() || !media.video) {
        return null;
      }

      const version = media.video.version;
      const token = this.hlsTokenProvider.generate(media.id, version);
      const base = `${process.env.R2_PUBLIC_URL!}/v/${media.id}/${token}/v${version}`;

      return {
        id: media.id,
        type: 'video',
        thumbnail: `${base}/poster.webp`,
        playback: {
          hls: `${base}/hls/master.m3u8`,
        },
      };
    }

    return null;
  }
}
