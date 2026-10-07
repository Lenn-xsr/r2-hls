import { Module } from '@nestjs/common';
import { MediaRepositoryPort } from '@r2-hls/contracts';
import { MongooseMediaRepositoryAdapter } from '@r2-hls/database';

/**
 * Slim persistence module for the worker: just the Media repository (transcode
 * reads + status writes). No signed-url / resolver / HLS token adapters — those
 * stay in the api.
 */
@Module({
  providers: [
    {
      provide: MediaRepositoryPort,
      useClass: MongooseMediaRepositoryAdapter,
    },
  ],
  exports: [MediaRepositoryPort],
})
export class MediaPersistenceModule {}
