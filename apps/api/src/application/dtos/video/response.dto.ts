import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VideoUploadResponseDto {
  @ApiProperty({
    description: 'R2 key reserved for the original; pass it to POST /videos',
    example: 'private/originals/3f0c…/source.mp4',
  })
  originalKey: string;

  @ApiProperty({
    description: 'Presigned URL — PUT the file here with the same Content-Type',
  })
  uploadUrl: string;

  @ApiProperty({ example: 'video/mp4' })
  contentType: string;

  @ApiProperty({ description: 'Upload URL lifetime in seconds', example: 900 })
  expiresInSeconds: number;
}

export class VideoStatusResponseDto {
  @ApiProperty({ description: 'Media/video ID', example: 'abc123' })
  id: string;

  @ApiProperty({
    description: 'Processing status',
    enum: ['pending', 'processing', 'ready', 'failed'],
    example: 'processing',
  })
  status: string;

  @ApiProperty({ description: 'Current delivery version', example: 1 })
  version: number;

  @ApiPropertyOptional({ description: 'Video duration in seconds' })
  durationSeconds?: number;

  @ApiPropertyOptional({ description: 'Source width in pixels' })
  width?: number;

  @ApiPropertyOptional({ description: 'Source height in pixels' })
  height?: number;

  @ApiPropertyOptional({ description: 'Error message when status=failed' })
  errorMessage?: string;
}

export class VideoPlaybackResponseDto {
  @ApiProperty({ description: 'Media/video ID', example: 'abc123' })
  id: string;

  @ApiProperty({ description: 'Signed URL of the poster image (WebP)' })
  thumbnail: string;

  @ApiProperty({ description: 'Signed URL of the HLS master playlist' })
  hls: string;
}
