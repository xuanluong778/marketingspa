import { Module } from '@nestjs/common';
import { MetaFanpageController } from './meta-fanpage.controller';
import { MetaFanpageService } from './meta-fanpage.service';

@Module({
  controllers: [MetaFanpageController],
  providers: [MetaFanpageService],
  exports: [MetaFanpageService],
})
export class MetaFanpageModule {}
