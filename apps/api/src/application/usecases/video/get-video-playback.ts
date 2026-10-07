import { Injectable } from '@nestjs/common';
import { MediaRepositoryPort } from '@r2-hls/contracts';
import {
  MediaResolverPort,
  ResolvedMediaVideo,
} from 'src/application/ports/media.provider.port';
import { ApiError, ErrorTypes } from 'src/domain/errors';

@Injectable()
export class GetVideoPlaybackUseCase {
  constructor(
    private readonly mediaRepository: MediaRepositoryPort,
    private readonly mediaResolver: MediaResolverPort,
  ) {}

  /**
   * Returns signed, short-lived delivery URLs (HLS master playlist + poster)
   * for a transcoded video.
   */
  async get(videoId: string): Promise<ResolvedMediaVideo> {
    const media = await this.mediaRepository.findById(videoId);

    if (!media || !media.isHls()) {
      throw new ApiError(ErrorTypes.MEDIA_NOT_FOUND);
    }

    const resolved = this.mediaResolver.resolveMedia(media);

    if (!resolved || resolved.type !== 'video') {
      throw new ApiError(
        ErrorTypes.VIDEO_NOT_READY,
        `status: ${media.video?.status ?? 'unknown'}`,
      );
    }

    return resolved;
  }
}
