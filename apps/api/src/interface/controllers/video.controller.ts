import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Media } from '@r2-hls/contracts';
import {
  CreateVideoUploadUseCase,
  GetVideoPlaybackUseCase,
  RegisterVideoUseCase,
} from 'src/application/usecases/video';
import {
  CreateVideoUploadDto,
  RegisterVideoDto,
} from 'src/application/dtos/video/request.dto';
import {
  VideoPlaybackResponseDto,
  VideoStatusResponseDto,
  VideoUploadResponseDto,
} from 'src/application/dtos/video/response.dto';
import { SharedSecretGuard } from '../guards/shared-secret.guard';

const VideoIngestGuard = SharedSecretGuard('VIDEO_INGEST_SECRET');

/**
 * Server-to-server video endpoints. They are gated by a shared secret and are
 * meant to be called by your own backend, which owns end-user authorization.
 */
@ApiTags('Videos')
@ApiSecurity('ingest-secret')
@ApiResponse({ status: 401, description: 'Invalid ingest authorization' })
@Controller('videos')
@UseGuards(VideoIngestGuard)
@SkipThrottle()
export class VideoController {
  constructor(
    private readonly createVideoUploadUseCase: CreateVideoUploadUseCase,
    private readonly registerVideoUseCase: RegisterVideoUseCase,
    private readonly getVideoPlaybackUseCase: GetVideoPlaybackUseCase,
  ) {}

  private toStatusResponse(media: Media): VideoStatusResponseDto {
    return {
      id: media.id,
      status: media.video?.status ?? 'pending',
      version: media.video?.version ?? 1,
      durationSeconds: media.video?.durationSeconds,
      width: media.video?.width,
      height: media.video?.height,
      errorMessage: media.video?.errorMessage,
    };
  }

  @Post('uploads')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Create a presigned upload URL for a new original',
    description:
      'Step 1. PUT the file to `uploadUrl` with the same Content-Type, then register it with `originalKey`.',
  })
  @ApiResponse({ status: 201, type: VideoUploadResponseDto })
  @ApiResponse({ status: 415, description: 'Unsupported content type' })
  createUpload(
    @Body() dto: CreateVideoUploadDto,
  ): Promise<VideoUploadResponseDto> {
    return this.createVideoUploadUseCase.create({
      contentType: dto.contentType,
    });
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({
    summary: 'Register an uploaded video and enqueue its transcode',
    description:
      'Step 2. The original must already be in R2 at `originalKey`. Creates the Media (status=pending) and enqueues the transcode job.',
  })
  @ApiResponse({ status: 201, type: VideoStatusResponseDto })
  async register(
    @Body() dto: RegisterVideoDto,
  ): Promise<VideoStatusResponseDto> {
    const media = await this.registerVideoUseCase.register({
      originalKey: dto.originalKey,
      title: dto.title,
    });
    return this.toStatusResponse(media);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get video processing status' })
  @ApiResponse({ status: 200, type: VideoStatusResponseDto })
  @ApiResponse({ status: 404, description: 'Video not found' })
  async status(@Param('id') id: string): Promise<VideoStatusResponseDto> {
    const media = await this.registerVideoUseCase.getStatus(id);
    return this.toStatusResponse(media);
  }

  @Get(':id/playback')
  @ApiOperation({
    summary: 'Get signed playback URLs',
    description:
      'Step 3. Returns a short-lived HLS master playlist URL and poster served by the cdn-worker.',
  })
  @ApiResponse({ status: 200, type: VideoPlaybackResponseDto })
  @ApiResponse({ status: 404, description: 'Video not found' })
  @ApiResponse({ status: 409, description: 'Video is not ready yet' })
  async playback(@Param('id') id: string): Promise<VideoPlaybackResponseDto> {
    const resolved = await this.getVideoPlaybackUseCase.get(id);
    return {
      id: resolved.id,
      thumbnail: resolved.thumbnail,
      hls: resolved.playback.hls,
    };
  }

  @Post(':id/transcode')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Reprocess a video into a new version',
    description:
      'Bumps the version and enqueues a fresh transcode job for the same original.',
  })
  @ApiResponse({ status: 202, type: VideoStatusResponseDto })
  @ApiResponse({ status: 404, description: 'Video not found' })
  async transcode(@Param('id') id: string): Promise<VideoStatusResponseDto> {
    const media = await this.registerVideoUseCase.reprocess(id);
    return this.toStatusResponse(media);
  }
}
