import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { createUploadMulterOptions } from '../common/uploads/upload-policy';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { RagKbService } from './rag-kb.service';
import {
  CreateRagKbDto,
  ImportRagKbTextDto,
  ImportRagKbUrlDto,
  RagKbSearchDto,
  UpdateRagKbDto,
} from './dto/rag-kb.dto';

@Controller('rag-kb')
@UseGuards(JwtAuthGuard, TenantGuard)
export class RagKbController {
  constructor(private readonly service: RagKbService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.organizationId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRagKbDto) {
    return this.service.create(user.organizationId, dto);
  }

  @Post('search')
  search(@CurrentUser() user: AuthUser, @Body() dto: RagKbSearchDto) {
    return this.service.search(user.organizationId, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user.organizationId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateRagKbDto,
  ) {
    return this.service.update(user.organizationId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user.organizationId, id);
  }

  @Post(':id/reindex')
  reindex(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.reindex(user.organizationId, id);
  }

  @Post(':id/import/text')
  importText(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ImportRagKbTextDto,
  ) {
    return this.service.importText(user.organizationId, id, dto);
  }

  @Post(':id/import/url')
  importUrl(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ImportRagKbUrlDto,
  ) {
    return this.service.importUrl(user.organizationId, id, dto);
  }

  @Post(':id/import/file')
  @UseInterceptors(FileInterceptor('file', createUploadMulterOptions('kb_text')))
  importFile(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFile()
    file: { originalname?: string; buffer?: Buffer } | undefined,
  ) {
    return this.service.importFile(user.organizationId, id, file || {});
  }

  @Delete(':id/documents/:docId')
  deleteDocument(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('docId') docId: string,
  ) {
    return this.service.deleteDocument(user.organizationId, id, docId);
  }
}
