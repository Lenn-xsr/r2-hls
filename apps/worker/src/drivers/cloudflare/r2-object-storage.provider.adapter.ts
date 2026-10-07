import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import {
  R2ObjectStorageProviderPort,
  UploadFileInput,
} from '@r2-hls/contracts';

export class R2ObjectStorageProviderAdapter implements R2ObjectStorageProviderPort {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucket = process.env.R2_BUCKET;

    if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
      throw new Error(
        'R2ObjectStorageProviderAdapter: Missing required R2 environment variables (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET)',
      );
    }

    this.bucket = bucket;
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async downloadToFile(key: string, destPath: string): Promise<void> {
    const sanitizedKey = key.replace(/^\/+/, '');

    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: sanitizedKey,
      }),
    );

    if (!result.Body) {
      throw new Error(`R2 object body is empty for key: ${sanitizedKey}`);
    }

    await pipeline(
      result.Body as NodeJS.ReadableStream,
      createWriteStream(destPath),
    );
  }

  async uploadFile(input: UploadFileInput): Promise<void> {
    const sanitizedKey = input.key.replace(/^\/+/, '');

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: sanitizedKey,
        Body: createReadStream(input.filePath),
        ContentType: input.contentType,
        CacheControl: input.cacheControl,
      }),
    );
  }
}
