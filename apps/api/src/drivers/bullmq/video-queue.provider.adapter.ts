import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  TranscodeJobInput,
  VideoQueueProviderPort,
  TRANSCODE_JOB_NAME,
  VIDEO_PROCESSING_QUEUE,
} from '@r2-hls/contracts';

@Injectable()
export class BullVideoQueueAdapter implements VideoQueueProviderPort {
  constructor(
    @InjectQueue(VIDEO_PROCESSING_QUEUE)
    private readonly queue: Queue,
  ) {}

  async enqueueTranscode(input: TranscodeJobInput): Promise<void> {
    // BullMQ forbids ':' in custom job ids (Redis key separator).
    await this.queue.add(TRANSCODE_JOB_NAME, input, {
      jobId: `${TRANSCODE_JOB_NAME}-${input.videoId}-v${input.version}`,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    });
  }
}
