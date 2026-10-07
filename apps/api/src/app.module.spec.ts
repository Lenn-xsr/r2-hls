import { INestApplication } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { VIDEO_PROCESSING_QUEUE } from '@r2-hls/contracts';
import { AppModule } from './app.module';

// The queue is replaced below, so no Redis connection is ever opened.
jest.mock('@r2-hls/database', () => ({
  ...jest.requireActual<object>('@r2-hls/database'),
  createQueueConnection: () => ({}),
}));

/**
 * Boots the real AppModule — every module, guard, interceptor and adapter —
 * to prove the dependency graph resolves. Only the BullMQ queue is swapped;
 * the R2 presigner is real (signing is a local computation, no network).
 */
describe('AppModule wiring', () => {
  const envBackup = { ...process.env };
  let app: INestApplication<App>;

  beforeAll(async () => {
    Object.assign(process.env, {
      R2_ACCOUNT_ID: 'account123',
      R2_ACCESS_KEY_ID: 'test-access-key',
      R2_SECRET_ACCESS_KEY: 'test-secret-key',
      R2_BUCKET: 'media',
      R2_PUBLIC_URL: 'https://media.example.com',
      HLS_TOKEN_SECRET: 'hls-secret',
      SIGNED_URL_SECRET: 'signed-url-secret',
      VIDEO_INGEST_SECRET: 'ingest-secret',
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getQueueToken(VIDEO_PROCESSING_QUEUE))
      .useValue({ add: jest.fn() })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    process.env = { ...envBackup };
  });

  it('serves the health check', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.body).toMatchObject({ status: 'ok' });
    expect(response.headers['x-request-id']).toBeDefined();
  });

  it('presigns an upload against the configured R2 bucket', async () => {
    const response = await request(app.getHttpServer())
      .post('/videos/uploads')
      .set('Authorization', 'ingest-secret')
      .send({ contentType: 'video/mp4' })
      .expect(201);

    const { originalKey, uploadUrl } = response.body as {
      originalKey: string;
      uploadUrl: string;
    };
    const url = new URL(uploadUrl);

    expect(url.host).toBe('media.account123.r2.cloudflarestorage.com');
    expect(url.pathname).toBe(`/${originalKey}`);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain(
      'content-type',
    );
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/);
  });
});
