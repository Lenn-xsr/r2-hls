import { Injectable } from '@nestjs/common';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join, relative, extname } from 'path';
import { lookup as mimeLookup } from 'mime-types';
import {
  MediaRepositoryPort,
  R2ObjectStorageProviderPort,
  LoggerProviderPort,
  hlsDeliveryPrefix,
} from '@r2-hls/contracts';
import {
  buildHlsFmp4Args,
  getVideoMetadata,
  selectVariants,
} from './hls-variants';

const HLS_CACHE_CONTROL = 'public, max-age=31536000, immutable';

@Injectable()
export class VideoHlsService {
  constructor(
    private readonly mediaRepository: MediaRepositoryPort,
    private readonly storage: R2ObjectStorageProviderPort,
    private readonly logger: LoggerProviderPort,
  ) {}

  async processVideo(videoId: string): Promise<void> {
    const media = await this.mediaRepository.findById(videoId);

    if (!media || !media.isHls() || !media.video) {
      throw new Error(`Video media not found or not HLS: ${videoId}`);
    }

    const { originalKey, version } = media.video;
    const deliveryPrefix = hlsDeliveryPrefix(videoId, version);

    const workdir = join(tmpdir(), `hls-${videoId}-v${version}`);
    const inputPath = join(workdir, `input${extname(originalKey) || '.mp4'}`);
    const outputDir = join(workdir, 'output');
    const posterPath = join(outputDir, 'poster.webp');

    const maxDuration = Number(process.env.VIDEO_MAX_DURATION_SECONDS ?? 90);
    const startedAt = Date.now();

    try {
      await fs.mkdir(join(outputDir, 'hls'), { recursive: true });

      await this.mediaRepository.updateVideo(videoId, { status: 'processing' });

      this.logger.info('Transcode started', { videoId, version, originalKey });

      await this.storage.downloadToFile(originalKey, inputPath);

      const probe = await this.runFfprobe(inputPath);
      const metadata = getVideoMetadata(probe);

      if (metadata.duration <= 0 || metadata.duration > maxDuration) {
        throw new Error(`Invalid duration: ${metadata.duration}`);
      }

      if (metadata.width <= 0 || metadata.height <= 0) {
        throw new Error('Invalid video dimensions');
      }

      const variants = selectVariants(metadata.height);

      await this.runFfmpeg(
        buildHlsFmp4Args({
          inputPath,
          outputDir,
          variants,
          hasAudio: metadata.hasAudio,
        }),
      );

      await this.runFfmpeg([
        '-y',
        // Frame 0: the poster matches the video's first decoded frame, so the
        // poster→video handoff has no visible "jump" (the client shows the poster
        // instantly while the first segment buffers).
        '-ss',
        '00:00:00',
        '-i',
        inputPath,
        '-frames:v',
        '1',
        '-vf',
        'scale=-2:1280:force_original_aspect_ratio=decrease',
        posterPath,
      ]);

      // Upload every generated file BEFORE flipping the DB to ready, so the
      // version is only ever pointed at once all objects are present in R2.
      await this.uploadDirectory(outputDir, deliveryPrefix);

      await this.mediaRepository.updateVideo(videoId, {
        status: 'ready',
        version,
        durationSeconds: Math.round(metadata.duration),
        width: metadata.width,
        height: metadata.height,
        hasAudio: metadata.hasAudio,
        variants: variants.map((v) => ({
          name: v.name,
          height: v.height,
          bandwidth: v.bandwidth,
        })),
        errorMessage: undefined,
        processedAt: new Date(),
      });

      this.logger.info('Transcode completed', {
        videoId,
        version,
        durationMs: Date.now() - startedAt,
        variantCount: variants.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      await this.mediaRepository.updateVideo(videoId, {
        status: 'failed',
        errorMessage: message,
      });

      this.logger.error('Transcode failed', {
        videoId,
        version,
        error: message,
      });
      throw error;
    } finally {
      await fs.rm(workdir, { recursive: true, force: true });
    }
  }

  private async uploadDirectory(
    localDir: string,
    remotePrefix: string,
  ): Promise<void> {
    const files = await this.walk(localDir);

    for (const filePath of files) {
      const rel = relative(localDir, filePath).replace(/\\/g, '/');
      const key = `${remotePrefix}/${rel}`;

      await this.storage.uploadFile({
        key,
        filePath,
        contentType: this.getContentType(filePath),
        cacheControl: HLS_CACHE_CONTROL,
      });
    }
  }

  private getContentType(filePath: string): string {
    if (filePath.endsWith('.m3u8')) return 'application/vnd.apple.mpegurl';
    if (filePath.endsWith('.m4s')) return 'video/iso.segment';
    if (filePath.endsWith('.mp4')) return 'video/mp4';
    if (filePath.endsWith('.webp')) return 'image/webp';
    if (filePath.endsWith('.ts')) return 'video/mp2t';

    return mimeLookup(filePath) || 'application/octet-stream';
  }

  private async walk(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    const files = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = join(dir, entry.name);
        return entry.isDirectory() ? this.walk(fullPath) : [fullPath];
      }),
    );

    return files.flat();
  }

  private runFfmpeg(args: string[]): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const child = spawn('ffmpeg', args);
      let stderr = '';

      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on('error', reject);

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(
          new Error(`FFmpeg failed with code ${code}: ${stderr.slice(-2000)}`),
        );
      });
    });
  }

  private runFfprobe(inputPath: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const child = spawn('ffprobe', [
        '-v',
        'error',
        '-show_entries',
        'format=duration,size',
        '-show_streams',
        '-of',
        'json',
        inputPath,
      ]);

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on('error', reject);

      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`ffprobe failed: ${stderr}`));
          return;
        }
        resolve(JSON.parse(stdout));
      });
    });
  }
}
