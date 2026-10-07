import {
  Controller,
  Get,
  INestApplication,
  Logger,
  MiddlewareConsumer,
  Module,
  NestModule,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { HttpExceptionFilter } from './exception.filter';
import { RequestIdMiddleware } from '../middleware/request-id.middleware';
import { ApiError, ErrorTypes } from 'src/domain/errors';

@Controller('boom')
class BoomController {
  @Get('api-error')
  apiError() {
    throw new ApiError(ErrorTypes.MEDIA_NOT_FOUND, 'id: abc');
  }

  @Get('http-error')
  httpError() {
    throw new NotFoundException('Nothing here');
  }

  @Get('crash')
  crash() {
    throw new Error('connection string mongodb://user:secret@db leaked');
  }
}

@Module({ controllers: [BoomController] })
class BoomModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*path');
  }
}

describe('HttpExceptionFilter', () => {
  let app: INestApplication<App>;
  let logged: jest.SpyInstance;

  beforeEach(async () => {
    logged = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    const moduleRef = await Test.createTestingModule({
      imports: [BoomModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    jest.restoreAllMocks();
  });

  it('renders a domain error as a problem document with its code and detail', async () => {
    const response = await request(app.getHttpServer())
      .get('/boom/api-error')
      .expect(404);

    expect(response.headers['content-type']).toContain(
      'application/problem+json',
    );
    expect(response.body).toMatchObject({
      type: 'MEDIA_NOT_FOUND',
      title: 'Media not found',
      status: 404,
      detail: 'id: abc',
      instance: '/boom/api-error',
    });
  });

  it('renders a framework HTTP error in the same format', async () => {
    const response = await request(app.getHttpServer())
      .get('/boom/http-error')
      .expect(404);

    expect(response.body).toMatchObject({
      type: 'HTTP_ERROR',
      title: 'Nothing here',
      status: 404,
    });
  });

  it('hides the cause of an unexpected error from the client but logs it', async () => {
    const response = await request(app.getHttpServer())
      .get('/boom/crash')
      .expect(500);

    expect(response.body).toMatchObject({
      type: 'INTERNAL_ERROR',
      title: 'Internal server error',
      detail: null,
    });
    expect(JSON.stringify(response.body)).not.toContain('secret');
    expect(logged).toHaveBeenCalledTimes(1);
    const [, stack] = logged.mock.calls[0] as [string, string];
    expect(stack).toContain('leaked');
  });

  it('echoes the caller request id, or generates one, on every error', async () => {
    const provided = await request(app.getHttpServer())
      .get('/boom/crash')
      .set('x-request-id', 'req-123');
    const generated = await request(app.getHttpServer()).get('/boom/crash');

    expect(provided.headers['x-request-id']).toBe('req-123');
    expect((provided.body as { requestId: string }).requestId).toBe('req-123');
    expect((generated.body as { requestId: string }).requestId).toMatch(
      /^[0-9a-f-]{36}$/,
    );
  });
});
