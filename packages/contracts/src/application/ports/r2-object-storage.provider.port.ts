export interface UploadFileInput {
  key: string;
  filePath: string;
  contentType: string;
  cacheControl?: string;
}

/**
 * Storage operations used by the transcoding worker: download an R2 object to
 * disk and upload a local file back to R2. Works against the same bucket used
 * for images, under the `private/` prefix.
 */
export abstract class R2ObjectStorageProviderPort {
  abstract downloadToFile(key: string, destPath: string): Promise<void>;

  abstract uploadFile(input: UploadFileInput): Promise<void>;
}
