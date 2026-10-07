import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MediaModule } from './media.module';
import {
  VideoQueueProviderPort,
  MediaRepositoryPort,
  VIDEO_PROCESSING_QUEUE,
} from '@r2-hls/contracts';
import { createQueueConnection } from '@r2-hls/database';
import { MediaResolverPort } from 'src/application/ports/media.provider.port';
import { UploadUrlProviderPort } from 'src/application/ports/upload-url.provider.port';
import {
  CreateVideoUploadUseCase,
  GetVideoPlaybackUseCase,
  RegisterVideoUseCase,
} from 'src/application/usecases/video';
import { BullVideoQueueAdapter } from '../bullmq/video-queue.provider.adapter';

@Module({
  imports: [
    // forRootAsync so the queue Redis connection is built at DI time (after
    // loadEnv runs in main.ts), not at module-import time when dotenv/Google
    // Secret Manager vars are not yet present in process.env.
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: createQueueConnection(),
        prefix: process.env.REDIS_QUEUE_PREFIX ?? 'bull',
      }),
    }),
    BullModule.registerQueue({ name: VIDEO_PROCESSING_QUEUE }),
    MediaModule,
  ],
  providers: [
    {
      provide: VideoQueueProviderPort,
      useClass: BullVideoQueueAdapter,
    },
    {
      provide: CreateVideoUploadUseCase,
      useFactory: (uploadUrlProvider: UploadUrlProviderPort) =>
        new CreateVideoUploadUseCase(uploadUrlProvider),
      inject: [UploadUrlProviderPort],
    },
    {
      provide: RegisterVideoUseCase,
      useFactory: (
        mediaRepository: MediaRepositoryPort,
        videoQueue: VideoQueueProviderPort,
      ) => new RegisterVideoUseCase(mediaRepository, videoQueue),
      inject: [MediaRepositoryPort, VideoQueueProviderPort],
    },
    {
      provide: GetVideoPlaybackUseCase,
      useFactory: (
        mediaRepository: MediaRepositoryPort,
        mediaResolver: MediaResolverPort,
      ) => new GetVideoPlaybackUseCase(mediaRepository, mediaResolver),
      inject: [MediaRepositoryPort, MediaResolverPort],
    },
  ],
  exports: [
    CreateVideoUploadUseCase,
    RegisterVideoUseCase,
    GetVideoPlaybackUseCase,
  ],
})
export class VideoModule {}
