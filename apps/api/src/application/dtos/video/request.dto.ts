import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateVideoUploadDto {
  @ApiProperty({
    description: 'Content-Type of the file that will be uploaded',
    example: 'video/mp4',
  })
  @IsString()
  contentType: string;
}

export class RegisterVideoDto {
  @ApiProperty({
    description:
      'R2 key of the uploaded original, as returned by POST /videos/uploads',
    example: 'private/originals/3f0c…/source.mp4',
  })
  @IsString()
  originalKey: string;

  @ApiPropertyOptional({ description: 'Human-readable title' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}
