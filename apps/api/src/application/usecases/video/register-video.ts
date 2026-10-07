import { Injectable } from '@nestjs/common';
import {
  Media,
  MediaRepositoryPort,
  VideoQueueProviderPort,
  ORIGINALS_PREFIX,
} from '@r2-hls/contracts';
import { ApiError, ErrorTypes } from 'src/domain/errors';

export interface RegisterVideoInput {
  originalKey: string;
  title?: string;
}

@Injectable()
export class RegisterVideoUseCase {
  constructor(
    private readonly mediaRepository: MediaRepositoryPort,
    private readonly videoQueue: VideoQueueProviderPort,
  ) {}

  async register(input: RegisterVideoInput): Promise<Media> {
    // The worker downloads whatever key is registered, so only keys under the
    // originals prefix are accepted — never an arbitrary object in the bucket.
    if (!input.originalKey?.startsWith(`${ORIGINALS_PREFIX}/`)) {
      throw new ApiError(
        ErrorTypes.VALIDATION_ERROR,
        `originalKey must start with ${ORIGINALS_PREFIX}/`,
      );
    }

    const version = 1;

    const media = await this.mediaRepository.createVideoMedia({
      originalKey: input.originalKey,
      version,
      title: input.title,
    });

    await this.videoQueue.enqueueTranscode({ videoId: media.id, version });

    return media;
  }

  /**
   * Re-transcodes the same original into a NEW version prefix. The previous
   * version keeps serving until the new one is ready, and no cache purge is
   * needed because the delivery path changes with the version.
   */
  async reprocess(videoId: string): Promise<Media> {
    const media = await this.mediaRepository.findById(videoId);

    if (!media || !media.isHls() || !media.video) {
      throw new ApiError(ErrorTypes.MEDIA_NOT_FOUND);
    }

    const nextVersion = media.video.version + 1;

    await this.mediaRepository.updateVideo(videoId, {
      status: 'pending',
      version: nextVersion,
      errorMessage: undefined,
    });

    await this.videoQueue.enqueueTranscode({ videoId, version: nextVersion });

    const updated = await this.mediaRepository.findById(videoId);
    return updated ?? media;
  }

  async getStatus(videoId: string): Promise<Media> {
    const media = await this.mediaRepository.findById(videoId);

    if (!media || !media.isHls()) {
      throw new ApiError(ErrorTypes.MEDIA_NOT_FOUND);
    }

    return media;
  }
}
