import { Module } from '@nestjs/common';
import { RagKbController } from './rag-kb.controller';
import { RagKbService } from './rag-kb.service';

@Module({
  controllers: [RagKbController],
  providers: [RagKbService],
  exports: [RagKbService],
})
export class RagKbModule {}
