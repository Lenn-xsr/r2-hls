import { Module } from '@nestjs/common';
import { MediaRepositoryPort } from '@r2-hls/contracts';
import { MongooseMediaRepositoryAdapter } from '@r2-hls/database';
import {
  R2SignedUrlProviderPort,
  MediaResolverPort,
} from 'src/application/ports/media.provider.port';
import { HlsTokenProviderPort } from 'src/application/ports/hls-token.provider.port';
import { UploadUrlProviderPort } from 'src/application/ports/upload-url.provider.port';
import {
  R2SignedUrlProviderAdapter,
  R2UploadUrlProviderAdapter,
  MediaResolverProviderAdapter,
  HlsTokenProviderAdapter,
} from '../cloudflare';

/**
 * Media persistence + everything needed to get bytes in (presigned uploads)
 * and out (signed delivery URLs) of R2.
 */
@Module({
  providers: [
    {
      provide: MediaRepositoryPort,
      useClass: MongooseMediaRepositoryAdapter,
    },
    {
      provide: UploadUrlProviderPort,
      useClass: R2UploadUrlProviderAdapter,
    },
    {
      provide: R2SignedUrlProviderPort,
      useClass: R2SignedUrlProviderAdapter,
    },
    {
      provide: HlsTokenProviderPort,
      useClass: HlsTokenProviderAdapter,
    },
    {
      provide: MediaResolverPort,
      useFactory: (
        r2Provider: R2SignedUrlProviderPort,
        hlsTokenProvider: HlsTokenProviderPort,
      ) => new MediaResolverProviderAdapter(r2Provider, hlsTokenProvider),
      inject: [R2SignedUrlProviderPort, HlsTokenProviderPort],
    },
  ],
  exports: [
    MediaRepositoryPort,
    UploadUrlProviderPort,
    R2SignedUrlProviderPort,
    HlsTokenProviderPort,
    MediaResolverPort,
  ],
})
export class MediaModule {}
