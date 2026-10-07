export interface CreateUploadUrlInput {
  /** R2 object key the client is allowed to write. */
  key: string;
  /** Content-Type the client must send; it is part of the signature. */
  contentType: string;
  expiresInSeconds: number;
}

/**
 * Issues short-lived presigned PUT URLs so clients upload originals straight
 * to object storage — the bytes never pass through the API.
 */
export abstract class UploadUrlProviderPort {
  abstract createUploadUrl(input: CreateUploadUrlInput): Promise<string>;
}
