import { Module } from '@nestjs/common';
import { VideoTranscriptionController } from './video-transcription.controller';
import { VideoTranscriptionService } from './video-transcription.service';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [BillingModule],
  controllers: [VideoTranscriptionController],
  providers: [VideoTranscriptionService],
  exports: [VideoTranscriptionService],
})
export class VideoTranscriptionModule {}
