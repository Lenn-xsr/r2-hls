import { Module } from '@nestjs/common';
import { LoggerModule } from '@r2-hls/logger';
import { MediaPersistenceModule } from './drivers/modules/media-persistence.module';
import { VideoProcessingModule } from './drivers/modules/video-processing.module';

@Module({
  imports: [LoggerModule, MediaPersistenceModule, VideoProcessingModule],
})
export class WorkerModule {}
