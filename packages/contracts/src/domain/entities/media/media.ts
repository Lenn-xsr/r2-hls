import { id } from '../../value-objects/id';
import { MediaType, MediaProvider, VideoMeta } from './media.interface';

export class Media {
  constructor(
    public readonly id: id,
    public readonly type: MediaType,
    public readonly provider: MediaProvider,
    public readonly storageId: string, // internal - never expose
    public readonly hidden: boolean,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    public readonly title?: string,
    public readonly video?: VideoMeta,
  ) {}

  isHidden(): boolean {
    return this.hidden;
  }

  isVideo(): boolean {
    return this.type === 'video';
  }

  isImage(): boolean {
    return this.type === 'image';
  }

  isR2(): boolean {
    return this.provider === 'r2';
  }

  isHls(): boolean {
    return this.provider === 'hls';
  }

  isVideoReady(): boolean {
    return this.video?.status === 'ready';
  }
}
