import {
  MediaRepositoryPort,
  MediaListResult,
  MediaListParams,
  CreateVideoMediaInput,
  CreateImageMediaInput,
  UpdateMediaInput,
  Media,
  VideoMeta,
} from '@r2-hls/contracts';
import { Types } from 'mongoose';
import { MediaModel, MediaModelType } from '../models/media.model';
import { MediaMapper } from '../mappers/media.mapper';

export class MongooseMediaRepositoryAdapter implements MediaRepositoryPort {
  async findById(id: string): Promise<Media | null> {
    const media = await MediaModel.findById(id).exec();

    if (!media) {
      return null;
    }

    return MediaMapper.toDomain(media);
  }

  async findByIds(ids: string[]): Promise<Media[]> {
    if (!ids.length) {
      return [];
    }

    const mediaList = await MediaModel.find({
      _id: { $in: ids },
    }).exec();

    return mediaList.map((media) => MediaMapper.toDomain(media));
  }

  async list(params: MediaListParams): Promise<MediaListResult> {
    const { includeHidden, token, perPage = 20 } = params;

    const match: Record<string, unknown> = {};
    if (!includeHidden) match.hidden = false;
    if (token) match._id = { $lt: token };

    const aggregateResult = await MediaModel.aggregate([
      { $match: match },
      { $sort: { _id: -1 as const } },
      { $limit: perPage + 1 },
    ]).exec();

    const mediaList = aggregateResult as MediaModelType[];

    const hasMorePages = mediaList.length > perPage;
    const nextToken =
      hasMorePages && mediaList[perPage - 1]
        ? String(mediaList[perPage - 1]._id)
        : null;

    return {
      results: mediaList
        .slice(0, perPage)
        .map((doc) => MediaMapper.toDomain(doc)),
      nextToken,
    };
  }

  async createVideoMedia(input: CreateVideoMediaInput): Promise<Media> {
    // Generate the id up front so storageId can mirror it in a single insert.
    // storageId is `required` in the schema, so it must be a non-empty value
    // at creation time (an empty string fails Mongoose's required validation).
    const id = input.id ?? new Types.ObjectId().toString();

    const doc = await MediaModel.create({
      _id: id,
      type: 'video',
      provider: 'hls',
      storageId: id,
      hidden: false,
      title: input.title,
      video: {
        status: 'pending',
        version: input.version,
        originalKey: input.originalKey,
      },
    });

    return MediaMapper.toDomain(doc as unknown as MediaModelType);
  }

  async createImageMedia(input: CreateImageMediaInput): Promise<Media> {
    // Images carry no `video` subdoc and no readiness state — the R2 object
    // key IS the storageId (contrast video, whose storageId mirrors the _id).
    const id = input.id ?? new Types.ObjectId().toString();

    const doc = await MediaModel.create({
      _id: id,
      type: 'image',
      provider: 'r2',
      storageId: input.storageId,
      hidden: false,
      title: input.title,
    });

    return MediaMapper.toDomain(doc as unknown as MediaModelType);
  }

  async updateVideo(id: string, video: Partial<VideoMeta>): Promise<void> {
    const updates: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(video)) {
      if (value !== undefined) {
        updates[`video.${key}`] = value;
      }
    }

    if (Object.keys(updates).length === 0) {
      return;
    }

    await MediaModel.updateOne({ _id: id }, { $set: updates }).exec();
  }

  async update(id: string, data: UpdateMediaInput): Promise<Media> {
    const updates: Record<string, unknown> = {};

    if (data.hidden !== undefined) updates.hidden = data.hidden;
    if (data.title !== undefined) updates.title = data.title;

    const doc = await MediaModel.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true },
    ).exec();

    if (!doc) {
      throw new Error('Media not found');
    }

    return MediaMapper.toDomain(doc as unknown as MediaModelType);
  }

  async deleteById(id: string): Promise<void> {
    await MediaModel.findByIdAndDelete(id).exec();
  }
}
