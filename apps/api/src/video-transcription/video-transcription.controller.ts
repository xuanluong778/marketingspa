import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { VIDEO_TRANSCRIPTION_LIMITS } from '@marketingspa/shared';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { VideoTranscriptionService } from './video-transcription.service';
import {
  CreateVideoTranscriptionDto,
  PatchVideoTranscriptionTextDto,
  RetryVideoTranscriptionChunkDto,
} from './dto/video-transcription.dto';
import { videoTranscriptionUploadsRoot } from './video-transcription-files';

const maxBytes = () =>
  Number(process.env.VIDEO_TRANSCRIPTION_MAX_FILE_BYTES) > 0
    ? Number(process.env.VIDEO_TRANSCRIPTION_MAX_FILE_BYTES)
    : VIDEO_TRANSCRIPTION_LIMITS.maxFileBytes;

@Controller('video-transcriptions')
@UseGuards(JwtAuthGuard, TenantGuard)
export class VideoTranscriptionController {
  constructor(private readonly service: VideoTranscriptionService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = join(videoTranscriptionUploadsRoot(), '_incoming');
          mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname || '').slice(0, 10) || '.bin';
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: maxBytes() },
    }),
  )
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateVideoTranscriptionDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.create(user, dto, file);
  }

  @Get('glossary')
  getGlossary(@CurrentUser() user: AuthUser) {
    return this.service.getGlossary(user);
  }

  @Get(':id')
  getById(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.getById(user, id);
  }

  @Patch(':id')
  patchText(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PatchVideoTranscriptionTextDto,
  ) {
    return this.service.updateText(user, id, dto.cleanedTranscript);
  }

  @Post(':id/retry')
  retry(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.retry(user, id);
  }

  @Post(':id/retry-chunk')
  retryChunk(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RetryVideoTranscriptionChunkDto,
  ) {
    return this.service.retryChunk(user, id, dto.chunkIndex);
  }
}
