import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { VideoController } from './video.controller';
import {
  CreateVideoUploadUseCase,
  GetVideoPlaybackUseCase,
  RegisterVideoUseCase,
} from 'src/application/usecases/video';
import { HttpExceptionFilter } from '../filters/exception.filter';
import {
  FakeVideoQueue,
  InMemoryMediaRepository,
  makeVideoMedia,
} from 'src/testing/fakes';

const SECRET = 'ingest-secret';

/**
 * HTTP-level tests: real controller, guard, validation pipe and exception
 * filter, with the storage/queue/database ports replaced by in-memory fakes.
 */
describe('VideoController (http)', () => {
  const envBackup = { ...process.env };
  let app: INestApplication<App>;
  let repository: InMemoryMediaRepository;
  let queue: FakeVideoQueue;

  beforeEach(async () => {
    process.env.VIDEO_INGEST_SECRET = SECRET;
    repository = new InMemoryMediaRepository();
    queue = new FakeVideoQueue();

    const moduleRef = await Test.createTestingModule({
      controllers: [VideoController],
      providers: [
        {
          provide: CreateVideoUploadUseCase,
          useValue: new CreateVideoUploadUseCase({
            createUploadUrl: ({ key }) =>
              Promise.resolve(`https://r2.example.com/${key}`),
          }),
        },
        {
          provide: RegisterVideoUseCase,
          useValue: new RegisterVideoUseCase(repository, queue),
        },
        {
          provide: GetVideoPlaybackUseCase,
          useValue: new GetVideoPlaybackUseCase(repository, {
            resolveMedia: (media) =>
              media.isVideoReady()
                ? {
                    id: media.id,
                    type: 'video',
                    thumbnail: 'https://cdn.example.com/poster.webp',
                    playback: { hls: 'https://cdn.example.com/master.m3u8' },
                  }
                : null,
          }),
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    process.env = { ...envBackup };
  });

  const authed = (req: request.Test) => req.set('Authorization', SECRET);

  it('rejects requests without the shared secret as problem+json', async () => {
    const response = await request(app.getHttpServer())
      .post('/videos')
      .send({ originalKey: 'private/originals/abc/source.mp4' })
      .expect(401);

    expect(response.headers['content-type']).toContain(
      'application/problem+json',
    );
    expect(response.body).toMatchObject({
      type: 'SHARED_SECRET_UNAUTHORIZED',
      status: 401,
      instance: '/videos',
    });
    expect(queue.jobs).toHaveLength(0);
  });

  it('rejects a wrong secret', async () => {
    await request(app.getHttpServer())
      .get('/videos/abc')
      .set('Authorization', 'not-the-secret')
      .expect(401);
  });

  it('walks the whole flow: upload URL → register → status → playback', async () => {
    const server = app.getHttpServer();

    const upload = await authed(request(server).post('/videos/uploads'))
      .send({ contentType: 'video/mp4' })
      .expect(201);
    const { originalKey, uploadUrl } = upload.body as {
      originalKey: string;
      uploadUrl: string;
    };
    expect(uploadUrl).toBe(`https://r2.example.com/${originalKey}`);

    const registered = await authed(request(server).post('/videos'))
      .send({ originalKey, title: 'Demo' })
      .expect(201);
    const { id } = registered.body as { id: string };
    expect(registered.body).toMatchObject({ status: 'pending', version: 1 });
    expect(queue.jobs).toEqual([{ videoId: id, version: 1 }]);

    // Not transcoded yet → playback is a conflict, not a 404.
    const notReady = await authed(
      request(server).get(`/videos/${id}/playback`),
    ).expect(409);
    expect(notReady.body).toMatchObject({ type: 'VIDEO_NOT_READY' });

    // What the worker does once the transcode finishes.
    await repository.updateVideo(id, {
      status: 'ready',
      durationSeconds: 12,
      width: 1080,
      height: 1920,
    });

    const status = await authed(request(server).get(`/videos/${id}`)).expect(
      200,
    );
    expect(status.body).toMatchObject({
      id,
      status: 'ready',
      durationSeconds: 12,
      width: 1080,
      height: 1920,
    });

    const playback = await authed(
      request(server).get(`/videos/${id}/playback`),
    ).expect(200);
    expect(playback.body).toEqual({
      id,
      thumbnail: 'https://cdn.example.com/poster.webp',
      hls: 'https://cdn.example.com/master.m3u8',
    });
  });

  it('validates the request body', async () => {
    const response = await authed(request(app.getHttpServer()).post('/videos'))
      .send({ title: 'no key' })
      .expect(400);

    expect(response.body).toMatchObject({ type: 'HTTP_ERROR', status: 400 });
  });

  it('answers 415 for a non-video upload', async () => {
    const response = await authed(
      request(app.getHttpServer()).post('/videos/uploads'),
    )
      .send({ contentType: 'application/pdf' })
      .expect(415);

    expect(response.body).toMatchObject({ type: 'UNSUPPORTED_MEDIA_TYPE' });
  });

  it('enqueues a new version on reprocess', async () => {
    repository.seed(
      makeVideoMedia({ status: 'ready', version: 1 }, { id: 'abc' }),
    );

    const response = await authed(
      request(app.getHttpServer()).post('/videos/abc/transcode'),
    ).expect(202);

    expect(response.body).toMatchObject({ status: 'pending', version: 2 });
    expect(queue.jobs).toEqual([{ videoId: 'abc', version: 2 }]);
  });

  it('answers 404 for an unknown video', async () => {
    const response = await authed(
      request(app.getHttpServer()).get('/videos/missing'),
    ).expect(404);

    expect(response.body).toMatchObject({ type: 'MEDIA_NOT_FOUND' });
  });
});
