import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import {
  MediaRepositoryPort,
  R2ObjectStorageProviderPort,
  LoggerProviderPort,
  VIDEO_PROCESSING_QUEUE,
} from '@r2-hls/contracts';
import { createQueueConnection } from '@r2-hls/database';
import { MediaPersistenceModule } from './media-persistence.module';
import { R2ObjectStorageProviderAdapter } from '../cloudflare/r2-object-storage.provider.adapter';
import { VideoHlsService } from '../video/video-hls.service';
import { VideoProcessingProcessor } from '../video/video-processing.processor';

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
    MediaPersistenceModule,
  ],
  providers: [
    {
      provide: R2ObjectStorageProviderPort,
      useClass: R2ObjectStorageProviderAdapter,
    },
    {
      provide: VideoHlsService,
      useFactory: (
        mediaRepository: MediaRepositoryPort,
        storage: R2ObjectStorageProviderPort,
        logger: LoggerProviderPort,
      ) => new VideoHlsService(mediaRepository, storage, logger),
      inject: [
        MediaRepositoryPort,
        R2ObjectStorageProviderPort,
        LoggerProviderPort,
      ],
    },
    VideoProcessingProcessor,
  ],
})
export class VideoProcessingModule {}
