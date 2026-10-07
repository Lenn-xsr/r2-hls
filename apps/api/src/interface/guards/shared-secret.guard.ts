import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Type,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { ApiError, ErrorTypes } from 'src/domain/errors';

/**
 * Builds a guard that authorizes a request by constant-time comparing the
 * `authorization` header against a shared secret read from `process.env[envVar]`.
 *
 * Usage:
 *   const VideoIngestGuard = SharedSecretGuard('VIDEO_INGEST_SECRET');
 */
export function SharedSecretGuard(envVar: string): Type<CanActivate> {
  @Injectable()
  class SharedSecretGuardImpl implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
      const request = context.switchToHttp().getRequest<Request>();
      const authHeader = request.headers['authorization'];
      const secret = process.env[envVar];

      if (!secret) {
        throw new ApiError(ErrorTypes.SHARED_SECRET_MISSING);
      }

      if (!authHeader) {
        throw new ApiError(ErrorTypes.SHARED_SECRET_UNAUTHORIZED);
      }

      const authBuffer = Buffer.from(authHeader);
      const secretBuffer = Buffer.from(secret);

      const isValid =
        authBuffer.length === secretBuffer.length &&
        timingSafeEqual(authBuffer, secretBuffer);

      if (!isValid) {
        throw new ApiError(ErrorTypes.SHARED_SECRET_UNAUTHORIZED);
      }

      return true;
    }
  }

  return SharedSecretGuardImpl;
}
