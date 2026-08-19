/**
 * Signed download — token-only; no JWT required (URL expires via HMAC exp).
 */
import { Controller, Get, Param, Query, UnauthorizedException } from '@nestjs/common';
import { TeleprompterRecordingService } from './teleprompter-recording.service';

@Controller('content-marketing/teleprompter-signed')
export class TeleprompterSignedDownloadController {
  constructor(private readonly recordings: TeleprompterRecordingService) {}

  @Get(':id')
  download(@Param('id') id: string, @Query('token') token?: string) {
    if (!token?.trim()) {
      throw new UnauthorizedException('Thiếu token tải xuống');
    }
    return this.recordings.streamDownloadByToken(id, token.trim());
  }
}
