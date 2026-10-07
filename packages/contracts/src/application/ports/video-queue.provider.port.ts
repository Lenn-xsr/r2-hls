export interface TranscodeJobInput {
  videoId: string;
  version: number;
}

export abstract class VideoQueueProviderPort {
  abstract enqueueTranscode(input: TranscodeJobInput): Promise<void>;
}
