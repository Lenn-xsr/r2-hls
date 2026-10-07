import { describe, expect, it } from 'vitest';
import { MediaMapper } from './media.mapper';
import type { MediaModelType } from '../models/media.model';

const NOW = new Date('2026-01-01T00:00:00.000Z');

/** A stored document as Mongoose hands it back (absent fields are null/undefined). */
const doc = (fields: Record<string, unknown>) =>
  ({
    _id: 'abc',
    type: 'video',
    provider: 'hls',
    storageId: 'abc',
    createdAt: NOW,
    updatedAt: NOW,
    ...fields,
  }) as unknown as MediaModelType;

describe('MediaMapper.toDomain', () => {
  it('maps a fully processed video', () => {
    const media = MediaMapper.toDomain(
      doc({
        hidden: true,
        title: 'Demo',
        video: {
          status: 'ready',
          version: 3,
          originalKey: 'private/originals/x/source.mp4',
          durationSeconds: 12,
          width: 1080,
          height: 1920,
          hasAudio: true,
          variants: [{ name: '360p', height: 640, bandwidth: 650000 }],
          processedAt: NOW,
        },
      }),
    );

    expect(media.id).toBe('abc');
    expect(media.isHls()).toBe(true);
    expect(media.isVideoReady()).toBe(true);
    expect(media.hidden).toBe(true);
    expect(media.title).toBe('Demo');
    expect(media.video).toEqual({
      status: 'ready',
      version: 3,
      originalKey: 'private/originals/x/source.mp4',
      durationSeconds: 12,
      width: 1080,
      height: 1920,
      hasAudio: true,
      variants: [{ name: '360p', height: 640, bandwidth: 650000 }],
      errorMessage: undefined,
      processedAt: NOW,
    });
  });

  it('turns the nulls Mongo stores for unset fields into undefined', () => {
    const media = MediaMapper.toDomain(
      doc({
        title: null,
        video: {
          status: 'pending',
          version: 1,
          originalKey: 'private/originals/x/source.mp4',
          durationSeconds: null,
          width: null,
          height: null,
          hasAudio: null,
          variants: null,
          errorMessage: null,
          processedAt: null,
        },
      }),
    );

    expect(media.title).toBeUndefined();
    expect(media.hidden).toBe(false);
    expect(media.video).toEqual({
      status: 'pending',
      version: 1,
      originalKey: 'private/originals/x/source.mp4',
    });
    expect(media.isVideoReady()).toBe(false);
  });

  it('maps an image, which has no video metadata at all', () => {
    const media = MediaMapper.toDomain(
      doc({ type: 'image', provider: 'r2', storageId: 'public/a.png' }),
    );

    expect(media.isImage()).toBe(true);
    expect(media.isR2()).toBe(true);
    expect(media.storageId).toBe('public/a.png');
    expect(media.video).toBeUndefined();
  });

  it('ignores an empty video subdocument left behind by Mongoose', () => {
    const media = MediaMapper.toDomain(doc({ video: {} }));

    expect(media.video).toBeUndefined();
  });
});