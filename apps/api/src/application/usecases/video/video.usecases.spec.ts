import { CreateVideoUploadUseCase } from './create-video-upload';
import { GetVideoPlaybackUseCase } from './get-video-playback';
import { RegisterVideoUseCase } from './register-video';
import { CreateUploadUrlInput } from 'src/application/ports/upload-url.provider.port';
import { ApiError } from 'src/domain/errors';
import {
  FakeVideoQueue,
  InMemoryMediaRepository,
  makeImageMedia,
  makeVideoMedia,
} from 'src/testing/fakes';

async function errorOf(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error('Expected the promise to reject');
}

describe('CreateVideoUploadUseCase', () => {
  const requests: CreateUploadUrlInput[] = [];
  const useCase = new CreateVideoUploadUseCase({
    createUploadUrl: (input) => {
      requests.push(input);
      return Promise.resolve(`https://r2.example.com/${input.key}?sig=1`);
    },
  });

  beforeEach(() => {
    requests.length = 0;
  });

  it('reserves a unique key under the originals prefix and presigns it', async () => {
    const upload = await useCase.create({ contentType: 'video/mp4' });

    expect(upload.originalKey).toMatch(
      /^private\/originals\/[0-9a-f-]{36}\/source\.mp4$/,
    );
    expect(upload.uploadUrl).toBe(
      `https://r2.example.com/${upload.originalKey}?sig=1`,
    );
    expect(requests).toEqual([
      {
        key: upload.originalKey,
        contentType: 'video/mp4',
        expiresInSeconds: upload.expiresInSeconds,
      },
    ]);
  });

  it('never reuses a key', async () => {
    const first = await useCase.create({ contentType: 'video/mp4' });
    const second = await useCase.create({ contentType: 'video/mp4' });

    expect(second.originalKey).not.toBe(first.originalKey);
  });

  it.each([
    ['video/quicktime', '.mov'],
    ['video/webm', '.webm'],
  ])('maps %s to a %s original', async (contentType, extension) => {
    const upload = await useCase.create({ contentType });

    expect(upload.originalKey.endsWith(`/source${extension}`)).toBe(true);
  });

  it('rejects content types the transcoder is not meant to receive', async () => {
    const error = await errorOf(useCase.create({ contentType: 'image/png' }));

    expect(error.type).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(error.getStatus()).toBe(415);
    expect(requests).toHaveLength(0);
  });
});

describe('RegisterVideoUseCase', () => {
  let repository: InMemoryMediaRepository;
  let queue: FakeVideoQueue;
  let useCase: RegisterVideoUseCase;

  beforeEach(() => {
    repository = new InMemoryMediaRepository();
    queue = new FakeVideoQueue();
    useCase = new RegisterVideoUseCase(repository, queue);
  });

  it('creates a pending v1 video and enqueues its transcode', async () => {
    const media = await useCase.register({
      originalKey: 'private/originals/abc/source.mp4',
      title: 'Demo',
    });

    expect(media.title).toBe('Demo');
    expect(media.video).toMatchObject({
      status: 'pending',
      version: 1,
      originalKey: 'private/originals/abc/source.mp4',
    });
    expect(queue.jobs).toEqual([{ videoId: media.id, version: 1 }]);
  });

  it.each(['', 'private/videos/abc/v1/hls/master.m3u8', 'public/a.mp4'])(
    'refuses a key outside the originals prefix (%p)',
    async (originalKey) => {
      const error = await errorOf(useCase.register({ originalKey }));

      expect(error.type).toBe('VALIDATION_ERROR');
      expect(queue.jobs).toHaveLength(0);
    },
  );

  it('reprocesses into the next version without touching the original', async () => {
    repository.seed(
      makeVideoMedia(
        { status: 'failed', version: 2, errorMessage: 'boom' },
        { id: 'abc' },
      ),
    );

    const media = await useCase.reprocess('abc');

    expect(media.video).toMatchObject({
      status: 'pending',
      version: 3,
      originalKey: 'private/originals/abc/source.mp4',
    });
    expect(queue.jobs).toEqual([{ videoId: 'abc', version: 3 }]);
  });

  it('reports MEDIA_NOT_FOUND for unknown or non-video media', async () => {
    repository.seed(makeImageMedia('public/a.png', { id: 'img' }));

    expect((await errorOf(useCase.reprocess('missing'))).type).toBe(
      'MEDIA_NOT_FOUND',
    );
    expect((await errorOf(useCase.getStatus('img'))).type).toBe(
      'MEDIA_NOT_FOUND',
    );
  });
});

describe('GetVideoPlaybackUseCase', () => {
  let repository: InMemoryMediaRepository;
  let useCase: GetVideoPlaybackUseCase;

  beforeEach(() => {
    repository = new InMemoryMediaRepository();
    useCase = new GetVideoPlaybackUseCase(repository, {
      resolveMedia: (media) =>
        media.isVideoReady()
          ? {
              id: media.id,
              type: 'video',
              thumbnail: 'poster-url',
              playback: { hls: 'hls-url' },
            }
          : null,
    });
  });

  it('returns the signed URLs of a ready video', async () => {
    repository.seed(makeVideoMedia({ status: 'ready' }, { id: 'abc' }));

    expect(await useCase.get('abc')).toEqual({
      id: 'abc',
      type: 'video',
      thumbnail: 'poster-url',
      playback: { hls: 'hls-url' },
    });
  });

  it('answers 409 with the current status while the video is not ready', async () => {
    repository.seed(makeVideoMedia({ status: 'processing' }, { id: 'abc' }));

    const error = await errorOf(useCase.get('abc'));

    expect(error.type).toBe('VIDEO_NOT_READY');
    expect(error.getStatus()).toBe(409);
    expect(error.detail).toBe('status: processing');
  });

  it('answers 404 for an unknown video', async () => {
    expect((await errorOf(useCase.get('missing'))).type).toBe(
      'MEDIA_NOT_FOUND',
    );
  });
});
