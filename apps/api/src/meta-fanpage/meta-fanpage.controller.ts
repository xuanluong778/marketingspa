import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { CreateMetaFanpagePostDto } from './dto/meta-fanpage.dto';
import { MetaFanpageService } from './meta-fanpage.service';

@Controller('meta-fanpage')
@UseGuards(JwtAuthGuard, TenantGuard)
export class MetaFanpageController {
  constructor(private readonly service: MetaFanpageService) {}

  @Get('status')
  status() {
    return this.service.getStatus();
  }

  @Post('posts')
  publish(@CurrentUser() user: AuthUser, @Body() dto: CreateMetaFanpagePostDto) {
    return this.service.publishNow(user, dto);
  }
}
