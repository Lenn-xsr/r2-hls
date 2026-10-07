import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  TranscodeJobInput,
  TRANSCODE_JOB_NAME,
  VIDEO_PROCESSING_QUEUE,
} from '@r2-hls/contracts';
import { VideoHlsService } from './video-hls.service';

@Processor(VIDEO_PROCESSING_QUEUE, {
  concurrency: Number(process.env.WORKER_CONCURRENCY ?? 1),
})
export class VideoProcessingProcessor extends WorkerHost {
  constructor(private readonly videoHlsService: VideoHlsService) {
    super();
  }

  async process(job: Job<TranscodeJobInput>): Promise<void> {
    if (job.name !== TRANSCODE_JOB_NAME) {
      return;
    }

    await this.videoHlsService.processVideo(job.data.videoId);
  }
}
