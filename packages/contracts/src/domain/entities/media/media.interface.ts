export type MediaType = 'image' | 'video';
export type MediaProvider = 'r2' | 'hls';

export type VideoStatus = 'pending' | 'processing' | 'ready' | 'failed';

export interface VideoVariant {
  name: string;
  height: number;
  bandwidth: number;
}

export interface VideoMeta {
  status: VideoStatus;
  version: number;
  originalKey: string;
  durationSeconds?: number;
  width?: number;
  height?: number;
  hasAudio?: boolean;
  variants?: VideoVariant[];
  errorMessage?: string;
  processedAt?: Date;
}

export interface MediaInterface {
  id: string;
  type: MediaType;
  provider: MediaProvider;
  storageId: string; // file path in R2 (image) or the media id itself (hls video)
  hidden: boolean;
  title?: string;
  video?: VideoMeta;
  createdAt: Date;
  updatedAt: Date;
}
