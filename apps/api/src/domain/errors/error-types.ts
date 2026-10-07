import { HttpStatus } from '@nestjs/common';

export interface ErrorType {
  type: string;
  title: string;
  status: number;
}

const defineError = (
  type: string,
  title: string,
  status: number,
): ErrorType => ({
  type,
  title,
  status,
});

export const ErrorTypes = {
  SHARED_SECRET_MISSING: defineError(
    'SHARED_SECRET_MISSING',
    'Shared secret not configured',
    HttpStatus.UNAUTHORIZED,
  ),
  SHARED_SECRET_UNAUTHORIZED: defineError(
    'SHARED_SECRET_UNAUTHORIZED',
    'Invalid authorization',
    HttpStatus.UNAUTHORIZED,
  ),

  MEDIA_NOT_FOUND: defineError(
    'MEDIA_NOT_FOUND',
    'Media not found',
    HttpStatus.NOT_FOUND,
  ),
  VIDEO_NOT_READY: defineError(
    'VIDEO_NOT_READY',
    'Video is not ready for playback',
    HttpStatus.CONFLICT,
  ),

  UNSUPPORTED_MEDIA_TYPE: defineError(
    'UNSUPPORTED_MEDIA_TYPE',
    'Unsupported video content type',
    HttpStatus.UNSUPPORTED_MEDIA_TYPE,
  ),
  VALIDATION_ERROR: defineError(
    'VALIDATION_ERROR',
    'Validation error',
    HttpStatus.BAD_REQUEST,
  ),

  INTERNAL_ERROR: defineError(
    'INTERNAL_ERROR',
    'Internal server error',
    HttpStatus.INTERNAL_SERVER_ERROR,
  ),
} as const;
