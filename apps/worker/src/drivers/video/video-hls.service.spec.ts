import { spawnSync } from 'child_process';
import { existsSync, promises as fs } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import {
  LoggerProviderPort,
  Media,
  MediaRepositoryPort,
  R2ObjectStorageProviderPort,
  UploadFileInput,
  VideoMeta,
  createId,
} from '@r2-hls/contracts';
import { VideoHlsService } from './video-hls.service';

const hasFfmpeg =
  spawnSync('ffmpeg', ['-version']).status === 0 &&
  spawnSync('ffprobe', ['-version']).status === 0;

const VIDEO_ID = 'video-it';
const ORIGINAL_KEY = 'private/originals/it/source.mp4';
const PREFIX = `private/videos/${VIDEO_ID}/v1`;

/** A directory standing in for the R2 bucket. */
class DirectoryStorage implements R2ObjectStorageProviderPort {
  readonly uploads: UploadFileInput[] = [];

  constructor(
    private readonly root: string,
    private readonly events: string[],
  ) {}

  async downloadToFile(key: string, destPath: string): Promise<void> {
    await fs.copyFile(join(this.root, key), destPath);
  }

  async uploadFile(input: UploadFileInput): Promise<void> {
    const target = join(this.root, input.key);
    await fs.mkdir(dirname(target), { recursive: true });
    await fs.copyFile(input.filePath, target);
    this.uploads.push(input);
    this.events.push(`upload:${input.key}`);
  }
}

/** Holds the single video the worker is processing. */
class SingleVideoRepository {
  video: VideoMeta = {
    status: 'pending',
    version: 1,
    originalKey: ORIGINAL_KEY,
  };

  constructor(private readonly events: string[]) {}

  findById(id: string): Promise<Media | null> {
    const now = new Date();
    return Promise.resolve(
      id === VIDEO_ID
        ? new Media(
            createId(id),
            'video',
            'hls',
            id,
            false,
            now,
            now,
            undefined,
            {
              ...this.video,
            },
          )
        : null,
    );
  }

  updateVideo(_id: string, video: Partial<VideoMeta>): Promise<void> {
    this.video = { ...this.video, ...video };
    this.events.push(`status:${this.video.status}`);
    return Promise.resolve();
  }
}

const silentLogger: LoggerProviderPort = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/** 2s synthetic clip — tall enough (720x1280) to get the whole ladder. */
function generateClip(path: string): void {
  const result = spawnSync('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=720x1280:rate=30:duration=2',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=2',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-shortest',
    path,
  ]);
  if (result.status !== 0) {
    throw new Error(`Could not generate test clip: ${String(result.stderr)}`);
  }
}

const describeWithFfmpeg = hasFfmpeg ? describe : describe.skip;

describeWithFfmpeg('VideoHlsService (real ffmpeg)', () => {
  const envBackup = { ...process.env };
  let bucket: string;
  let events: string[];
  let storage: DirectoryStorage;
  let repository: SingleVideoRepository;
  let service: VideoHlsService;

  beforeAll(async () => {
    bucket = await fs.mkdtemp(join(tmpdir(), 'r2-hls-bucket-'));
    await fs.mkdir(dirname(join(bucket, ORIGINAL_KEY)), { recursive: true });
    generateClip(join(bucket, ORIGINAL_KEY));
  }, 60_000);

  afterAll(async () => {
    await fs.rm(bucket, { recursive: true, force: true });
  });

  beforeEach(() => {
    events = [];
    storage = new DirectoryStorage(bucket, events);
    repository = new SingleVideoRepository(events);
    service = new VideoHlsService(
      repository as unknown as MediaRepositoryPort,
      storage,
      silentLogger,
    );
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('transcodes an original into a complete, playable HLS ladder', async () => {
    await service.processVideo(VIDEO_ID);

    const keys = storage.uploads.map((upload) => upload.key);

    expect(keys).toContain(`${PREFIX}/poster.webp`);
    expect(keys).toContain(`${PREFIX}/hls/master.m3u8`);
    for (const variant of ['360p', '540p', '720p']) {
      expect(keys).toContain(`${PREFIX}/hls/${variant}/index.m3u8`);
      expect(
        keys.filter(
          (key) =>
            key.startsWith(`${PREFIX}/hls/${variant}/seg_`) &&
            key.endsWith('.m4s'),
        ).length,
      ).toBeGreaterThan(0);
    }
    // One fMP4 init segment per variant.
    expect(keys.filter((key) => key.endsWith('.mp4'))).toHaveLength(3);

    // Every object is uploaded as immutable with the right content type.
    for (const upload of storage.uploads) {
      expect(upload.cacheControl).toBe('public, max-age=31536000, immutable');
    }
    const typeOf = (suffix: string) =>
      storage.uploads.find((upload) => upload.key.endsWith(suffix))
        ?.contentType;
    expect(typeOf('master.m3u8')).toBe('application/vnd.apple.mpegurl');
    expect(typeOf('.m4s')).toBe('video/iso.segment');
    expect(typeOf('.webp')).toBe('image/webp');

    // The master playlist advertises each rung with a path relative to itself,
    // which is what lets one path-embedded token cover the whole ladder.
    const master = await fs.readFile(
      join(bucket, PREFIX, 'hls', 'master.m3u8'),
      'utf8',
    );
    expect(master).toContain('360p/index.m3u8');
    expect(master).toContain('540p/index.m3u8');
    expect(master).toContain('720p/index.m3u8');
    expect(master).not.toMatch(/https?:\/\//);

    expect(repository.video).toMatchObject({
      status: 'ready',
      version: 1,
      width: 720,
      height: 1280,
      durationSeconds: 2,
      hasAudio: true,
      variants: [
        { name: '360p', height: 640 },
        { name: '540p', height: 960 },
        { name: '720p', height: 1280 },
      ],
    });
  }, 120_000);

  it('only flips the video to ready after every object is uploaded', async () => {
    await service.processVideo(VIDEO_ID);

    expect(events[0]).toBe('status:processing');
    expect(events[events.length - 1]).toBe('status:ready');
    expect(
      events.slice(1, -1).every((event) => event.startsWith('upload:')),
    ).toBe(true);
  }, 120_000);

  it('marks the video as failed and uploads nothing when it is too long', async () => {
    process.env.VIDEO_MAX_DURATION_SECONDS = '1';

    await expect(service.processVideo(VIDEO_ID)).rejects.toThrow(
      /Invalid duration/,
    );

    expect(repository.video.status).toBe('failed');
    expect(repository.video.errorMessage).toMatch(/Invalid duration/);
    expect(storage.uploads).toHaveLength(0);
  }, 60_000);

  it('cleans up its scratch directory on success and on failure', async () => {
    const workdir = join(tmpdir(), `hls-${VIDEO_ID}-v1`);

    await service.processVideo(VIDEO_ID);
    expect(existsSync(workdir)).toBe(false);

    process.env.VIDEO_MAX_DURATION_SECONDS = '1';
    await expect(service.processVideo(VIDEO_ID)).rejects.toThrow();
    expect(existsSync(workdir)).toBe(false);
  }, 120_000);

  it('rejects an id that is not an HLS video', async () => {
    await expect(service.processVideo('missing')).rejects.toThrow(
      'Video media not found or not HLS: missing',
    );
  });
});
