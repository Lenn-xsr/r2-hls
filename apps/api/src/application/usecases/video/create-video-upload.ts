import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ORIGINALS_PREFIX } from '@r2-hls/contracts';
import { UploadUrlProviderPort } from 'src/application/ports/upload-url.provider.port';
import { ApiError, ErrorTypes } from 'src/domain/errors';

const UPLOAD_URL_TTL_SECONDS = 900;

/** Accepted source containers → the extension stored in the original's key. */
const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
};

export interface CreateVideoUploadInput {
  contentType: string;
}

export interface VideoUpload {
  originalKey: string;
  uploadUrl: string;
  contentType: string;
  expiresInSeconds: number;
}

@Injectable()
export class CreateVideoUploadUseCase {
  constructor(private readonly uploadUrlProvider: UploadUrlProviderPort) {}

  /**
   * Reserves a key for a new original and returns a presigned PUT URL for it.
   * The client uploads directly to R2, then calls register with `originalKey`.
   */
  async create(input: CreateVideoUploadInput): Promise<VideoUpload> {
    const extension = EXTENSION_BY_CONTENT_TYPE[input.contentType];

    if (!extension) {
      throw new ApiError(
        ErrorTypes.UNSUPPORTED_MEDIA_TYPE,
        `Allowed: ${Object.keys(EXTENSION_BY_CONTENT_TYPE).join(', ')}`,
      );
    }

    const originalKey = `${ORIGINALS_PREFIX}/${randomUUID()}/source${extension}`;

    const uploadUrl = await this.uploadUrlProvider.createUploadUrl({
      key: originalKey,
      contentType: input.contentType,
      expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
    });

    return {
      originalKey,
      uploadUrl,
      contentType: input.contentType,
      expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
    };
  }
}
