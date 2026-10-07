import { InferSchemaType, Schema, Types, model } from 'mongoose';

const MediaSchema = new Schema(
  {
    _id: {
      type: String,
      default: () => new Types.ObjectId().toString(),
    },
    type: {
      type: String,
      enum: ['image', 'video'],
      required: true,
    },
    provider: {
      type: String,
      enum: ['r2', 'hls'],
      required: true,
    },
    storageId: {
      type: String,
      required: true,
    },
    hidden: {
      type: Boolean,
      default: false,
    },
    title: { type: String },
    video: {
      type: {
        status: {
          type: String,
          enum: ['pending', 'processing', 'ready', 'failed'],
        },
        version: { type: Number },
        originalKey: { type: String },
        durationSeconds: { type: Number },
        width: { type: Number },
        height: { type: Number },
        hasAudio: { type: Boolean },
        variants: {
          type: [
            {
              _id: false,
              name: { type: String },
              height: { type: Number },
              bandwidth: { type: Number },
            },
          ],
          default: undefined,
        },
        errorMessage: { type: String },
        processedAt: { type: Date },
      },
      default: undefined,
    },
  },
  {
    timestamps: true,
  },
);

MediaSchema.index({ hidden: 1 });
MediaSchema.index({ type: 1 });
MediaSchema.index({ provider: 1 });
MediaSchema.index({ 'video.status': 1 });

export type MediaModelType = InferSchemaType<typeof MediaSchema>;

export const MediaModel = model('Media', MediaSchema);
