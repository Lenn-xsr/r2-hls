import {
  Media,
  MediaType,
  MediaProvider,
  VideoMeta,
  VideoStatus,
  createId,
} from '@r2-hls/contracts';
import { MediaModelType } from '../models/media.model';

export class MediaMapper {
  static toDomain(mongoMedia: MediaModelType): Media {
    const video = mongoMedia.video;

    const videoMeta: VideoMeta | undefined =
      video && video.status
        ? {
            status: video.status as VideoStatus,
            version: video.version ?? 1,
            originalKey: video.originalKey ?? '',
            durationSeconds: video.durationSeconds ?? undefined,
            width: video.width ?? undefined,
            height: video.height ?? undefined,
            hasAudio: video.hasAudio ?? undefined,
            variants:
              video.variants?.map((variant) => ({
                name: variant.name ?? '',
                height: variant.height ?? 0,
                bandwidth: variant.bandwidth ?? 0,
              })) ?? undefined,
            errorMessage: video.errorMessage ?? undefined,
            processedAt: video.processedAt ?? undefined,
          }
        : undefined;

    return new Media(
      createId(mongoMedia._id),
      mongoMedia.type as MediaType,
      mongoMedia.provider as MediaProvider,
      mongoMedia.storageId,
      mongoMedia.hidden ?? false,
      mongoMedia.createdAt,
      mongoMedia.updatedAt,
      mongoMedia.title ?? undefined,
      videoMeta,
    );
  }
}
