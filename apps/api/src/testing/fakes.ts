import {
  CreateImageMediaInput,
  CreateVideoMediaInput,
  Media,
  MediaListParams,
  MediaListResult,
  MediaRepositoryPort,
  TranscodeJobInput,
  UpdateMediaInput,
  VideoMeta,
  VideoQueueProviderPort,
  createId,
} from '@r2-hls/contracts';

const FIXED_DATE = new Date('2026-01-01T00:00:00.000Z');

interface MediaOverrides {
  id?: string;
  hidden?: boolean;
  title?: string;
}

export function makeVideoMedia(
  video: Partial<VideoMeta> = {},
  overrides: MediaOverrides = {},
): Media {
  const id = overrides.id ?? 'video-1';

  return new Media(
    createId(id),
    'video',
    'hls',
    id,
    overrides.hidden ?? false,
    FIXED_DATE,
    FIXED_DATE,
    overrides.title,
    {
      status: 'pending',
      version: 1,
      originalKey: 'private/originals/abc/source.mp4',
      ...video,
    },
  );
}

export function makeImageMedia(
  storageId: string,
  overrides: MediaOverrides = {},
): Media {
  return new Media(
    createId(overrides.id ?? 'image-1'),
    'image',
    'r2',
    storageId,
    overrides.hidden ?? false,
    FIXED_DATE,
    FIXED_DATE,
    overrides.title,
  );
}

/** In-memory MediaRepositoryPort — enough behavior to drive the use cases. */
export class InMemoryMediaRepository implements MediaRepositoryPort {
  private readonly items = new Map<string, Media>();
  private sequence = 0;

  seed(media: Media): Media {
    this.items.set(media.id, media);
    return media;
  }

  findById(id: string): Promise<Media | null> {
    return Promise.resolve(this.items.get(id) ?? null);
  }

  findByIds(ids: string[]): Promise<Media[]> {
    return Promise.resolve(
      ids.flatMap((id) => {
        const media = this.items.get(id);
        return media ? [media] : [];
      }),
    );
  }

  list(params: MediaListParams): Promise<MediaListResult> {
    const results = [...this.items.values()].filter(
      (media) => params.includeHidden || !media.hidden,
    );
    return Promise.resolve({ results, nextToken: null });
  }

  createVideoMedia(input: CreateVideoMediaInput): Promise<Media> {
    const id = input.id ?? `video-${++this.sequence}`;
    const media = makeVideoMedia(
      { version: input.version, originalKey: input.originalKey },
      { id, title: input.title },
    );
    return Promise.resolve(this.seed(media));
  }

  createImageMedia(input: CreateImageMediaInput): Promise<Media> {
    const id = input.id ?? `image-${++this.sequence}`;
    return Promise.resolve(
      this.seed(makeImageMedia(input.storageId, { id, title: input.title })),
    );
  }

  updateVideo(id: string, video: Partial<VideoMeta>): Promise<void> {
    const current = this.items.get(id);
    if (current?.video) {
      this.seed(
        makeVideoMedia(
          { ...current.video, ...video },
          { id, hidden: current.hidden, title: current.title },
        ),
      );
    }
    return Promise.resolve();
  }

  update(id: string, data: UpdateMediaInput): Promise<Media> {
    const current = this.items.get(id);
    if (!current) {
      return Promise.reject(new Error('Media not found'));
    }
    return Promise.resolve(
      this.seed(
        new Media(
          current.id,
          current.type,
          current.provider,
          current.storageId,
          data.hidden ?? current.hidden,
          current.createdAt,
          current.updatedAt,
          data.title ?? current.title,
          current.video,
        ),
      ),
    );
  }

  deleteById(id: string): Promise<void> {
    this.items.delete(id);
    return Promise.resolve();
  }
}

export class FakeVideoQueue implements VideoQueueProviderPort {
  readonly jobs: TranscodeJobInput[] = [];

  enqueueTranscode(input: TranscodeJobInput): Promise<void> {
    this.jobs.push(input);
    return Promise.resolve();
  }
}
