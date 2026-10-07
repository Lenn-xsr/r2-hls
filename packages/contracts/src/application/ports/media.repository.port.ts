import { Media } from '../../domain/entities/media';
import { VideoMeta } from '../../domain/entities/media/media.interface';

export interface MediaListResult {
  results: Media[];
  nextToken: string | null;
}

export interface CreateVideoMediaInput {
  id?: string;
  originalKey: string;
  version: number;
  title?: string;
}

export interface CreateImageMediaInput {
  id?: string;
  /**
   * R2 object key where the image bytes live. Use a `public/…` key for a
   * permanently public URL; any other prefix yields a short-lived signed URL
   * at delivery time.
   */
  storageId: string;
  title?: string;
}

export interface UpdateMediaInput {
  hidden?: boolean;
  title?: string;
}

export interface MediaListParams {
  /** Include hidden media. Defaults to false. */
  includeHidden?: boolean;
  token?: string;
  perPage?: number;
}

export abstract class MediaRepositoryPort {
  abstract findById(id: string): Promise<Media | null>;

  abstract findByIds(ids: string[]): Promise<Media[]>;

  /** Cursor-paginated list, newest first. */
  abstract list(params: MediaListParams): Promise<MediaListResult>;

  abstract createVideoMedia(input: CreateVideoMediaInput): Promise<Media>;

  /**
   * Create an image media (provider `r2`). Unlike video, an image needs no
   * transcoding — it is serveable the moment it exists (no `video` subdoc,
   * no readiness gate).
   */
  abstract createImageMedia(input: CreateImageMediaInput): Promise<Media>;

  abstract updateVideo(id: string, video: Partial<VideoMeta>): Promise<void>;

  abstract update(id: string, data: UpdateMediaInput): Promise<Media>;

  abstract deleteById(id: string): Promise<void>;
}
