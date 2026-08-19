import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { EmailMarketingService } from './email-marketing.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import {
  AddListMemberDto,
  AudiencePreviewQueryDto,
  CampaignQueryDto,
  CampaignRecipientQueryDto,
  ContactQueryDto,
  CreateEmailAutomationDto,
  CreateEmailAutomationFromRecipeDto,
  CreateEmailCampaignDto,
  CreateEmailContactDto,
  CreateEmailListDto,
  CreateEmailSegmentDto,
  CreateEmailSuppressionDto,
  CreateEmailTemplateDto,
  CreateSenderDomainDto,
  EmailSearchQueryDto,
  GenerateEmailContentDto,
  ScheduleEmailCampaignDto,
  SendTestEmailDto,
  UpdateEmailAutomationDto,
  UpdateEmailCampaignDto,
  UpdateEmailContactDto,
  UpdateEmailTemplateDto,
  UpdateSenderDomainDto,
} from './dto/email-marketing.dto';

@Controller('email-marketing')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class EmailMarketingController {
  constructor(private readonly service: EmailMarketingService) {}

  @Get('overview')
  @RequirePermissions('automation.view')
  overview(@CurrentUser() user: AuthUser) {
    return this.service.overview(user.organizationId);
  }

  @Get('audience-preview')
  @RequirePermissions('automation.view')
  audiencePreview(@CurrentUser() user: AuthUser, @Query() query: AudiencePreviewQueryDto) {
    return this.service.previewAudience(user.organizationId, query.listId);
  }

  @Get('reports')
  @RequirePermissions('automation.view')
  reports(@CurrentUser() user: AuthUser) {
    return this.service.reports(user.organizationId);
  }

  @Get('templates')
  @RequirePermissions('automation.view')
  listTemplates(@CurrentUser() user: AuthUser, @Query() query: EmailSearchQueryDto) {
    return this.service.listTemplates(user.organizationId, query);
  }

  @Post('templates')
  @RequirePermissions('automation.campaign.create')
  createTemplate(@CurrentUser() user: AuthUser, @Body() dto: CreateEmailTemplateDto) {
    return this.service.createTemplate(user.organizationId, dto, user.id);
  }

  @Post('generate')
  @RequirePermissions('automation.campaign.create')
  generateContent(@CurrentUser() user: AuthUser, @Body() dto: GenerateEmailContentDto) {
    return this.service.generateEmailContent(user.organizationId, dto.prompt);
  }

  @Post('send-test')
  @RequirePermissions('automation.campaign.send')
  sendTest(@CurrentUser() user: AuthUser, @Body() dto: SendTestEmailDto) {
    return this.service.sendTestEmail(dto);
  }

  @Patch('templates/:id')
  @RequirePermissions('automation.campaign.create')
  updateTemplate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateEmailTemplateDto,
  ) {
    return this.service.updateTemplate(user.organizationId, id, dto);
  }

  @Delete('templates/:id')
  @RequirePermissions('automation.campaign.create')
  deleteTemplate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.deleteTemplate(user.organizationId, id);
  }

  @Get('contacts')
  @RequirePermissions('automation.view')
  listContacts(@CurrentUser() user: AuthUser, @Query() query: ContactQueryDto) {
    return this.service.listContacts(user.organizationId, query);
  }

  @Get('contacts/facets')
  @RequirePermissions('automation.view')
  contactFacets(@CurrentUser() user: AuthUser) {
    return this.service.contactFacets(user.organizationId);
  }

  @Post('contacts')
  @RequirePermissions('automation.campaign.create')
  createContact(@CurrentUser() user: AuthUser, @Body() dto: CreateEmailContactDto) {
    return this.service.createContact(user.organizationId, dto);
  }

  @Post('contacts/import-customers')
  @RequirePermissions('automation.campaign.create')
  importCustomers(@CurrentUser() user: AuthUser) {
    return this.service.importFromCustomers(user.organizationId);
  }

  @Post('contacts/sync-crm')
  @RequirePermissions('automation.campaign.create')
  syncCrm(@CurrentUser() user: AuthUser) {
    return this.service.syncFromCrm(user.organizationId);
  }

  @Post('contacts/import-file')
  @RequirePermissions('automation.campaign.create')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  importFile(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query('listId') listId?: string,
  ) {
    return this.service.importSpreadsheet(user.organizationId, file, listId);
  }

  @Patch('contacts/:id')
  @RequirePermissions('automation.campaign.create')
  updateContact(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateEmailContactDto,
  ) {
    return this.service.updateContact(user.organizationId, id, dto);
  }

  @Delete('contacts/:id')
  @RequirePermissions('automation.campaign.create')
  deleteContact(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.deleteContact(user.organizationId, id);
  }

  @Get('lists')
  @RequirePermissions('automation.view')
  listLists(@CurrentUser() user: AuthUser, @Query() query: EmailSearchQueryDto) {
    return this.service.listLists(user.organizationId, query);
  }

  @Post('lists')
  @RequirePermissions('automation.campaign.create')
  createList(@CurrentUser() user: AuthUser, @Body() dto: CreateEmailListDto) {
    return this.service.createList(user.organizationId, dto);
  }

  @Patch('lists/:id')
  @RequirePermissions('automation.campaign.create')
  updateList(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateEmailListDto,
  ) {
    return this.service.updateList(user.organizationId, id, dto);
  }

  @Delete('lists/:id')
  @RequirePermissions('automation.campaign.create')
  deleteList(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.deleteList(user.organizationId, id);
  }

  @Get('lists/:id/members')
  @RequirePermissions('automation.view')
  listMembers(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() query: EmailSearchQueryDto,
  ) {
    return this.service.listMembers(user.organizationId, id, query);
  }

  @Post('lists/:id/members')
  @RequirePermissions('automation.campaign.create')
  addMember(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AddListMemberDto,
  ) {
    return this.service.addListMember(user.organizationId, id, dto);
  }

  @Delete('lists/:id/members/:contactId')
  @RequirePermissions('automation.campaign.create')
  removeMember(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('contactId') contactId: string,
  ) {
    return this.service.removeListMember(user.organizationId, id, contactId);
  }

  @Get('segments')
  @RequirePermissions('automation.view')
  listSegments(@CurrentUser() user: AuthUser, @Query() query: EmailSearchQueryDto) {
    return this.service.listSegments(user.organizationId, query);
  }

  @Post('segments')
  @RequirePermissions('automation.campaign.create')
  createSegment(@CurrentUser() user: AuthUser, @Body() dto: CreateEmailSegmentDto) {
    return this.service.createSegment(user.organizationId, dto);
  }

  @Patch('segments/:id')
  @RequirePermissions('automation.campaign.create')
  updateSegment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateEmailSegmentDto,
  ) {
    return this.service.updateSegment(user.organizationId, id, dto);
  }

  @Delete('segments/:id')
  @RequirePermissions('automation.campaign.create')
  deleteSegment(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.deleteSegment(user.organizationId, id);
  }

  @Get('campaigns')
  @RequirePermissions('automation.view')
  listCampaigns(@CurrentUser() user: AuthUser, @Query() query: CampaignQueryDto) {
    return this.service.listCampaigns(user.organizationId, query);
  }

  @Post('campaigns')
  @RequirePermissions('automation.campaign.create')
  createCampaign(@CurrentUser() user: AuthUser, @Body() dto: CreateEmailCampaignDto) {
    return this.service.createCampaign(user.organizationId, dto, user.id);
  }

  @Get('campaigns/:id')
  @RequirePermissions('automation.view')
  getCampaign(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.getCampaign(user.organizationId, id);
  }

  @Patch('campaigns/:id')
  @RequirePermissions('automation.campaign.create')
  updateCampaign(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateEmailCampaignDto,
  ) {
    return this.service.updateCampaign(user.organizationId, id, dto);
  }

  @Delete('campaigns/:id')
  @RequirePermissions('automation.campaign.create')
  deleteCampaign(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.deleteCampaign(user.organizationId, id);
  }

  @Post('campaigns/:id/send')
  @RequirePermissions('automation.campaign.send')
  sendCampaign(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.sendCampaign(user.organizationId, id);
  }

  @Post('campaigns/:id/schedule')
  @RequirePermissions('automation.campaign.send')
  scheduleCampaign(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ScheduleEmailCampaignDto,
  ) {
    return this.service.scheduleCampaign(user.organizationId, id, dto);
  }

  @Post('campaigns/:id/pause')
  @RequirePermissions('automation.campaign.send')
  pauseCampaign(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.pauseCampaign(user.organizationId, id);
  }

  @Post('campaigns/:id/cancel')
  @RequirePermissions('automation.campaign.send')
  cancelCampaign(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.cancelCampaign(user.organizationId, id);
  }

  @Get('campaigns/:id/recipients')
  @RequirePermissions('automation.view')
  listRecipients(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() query: CampaignRecipientQueryDto,
  ) {
    return this.service.listRecipients(user.organizationId, id, query);
  }

  @Get('suppressions')
  @RequirePermissions('automation.view')
  listSuppressions(@CurrentUser() user: AuthUser, @Query() query: EmailSearchQueryDto) {
    return this.service.listSuppressions(user.organizationId, query);
  }

  @Post('suppressions')
  @RequirePermissions('automation.campaign.create')
  createSuppression(@CurrentUser() user: AuthUser, @Body() dto: CreateEmailSuppressionDto) {
    return this.service.createSuppression(user.organizationId, dto);
  }

  @Delete('suppressions/:id')
  @RequirePermissions('automation.campaign.create')
  deleteSuppression(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.deleteSuppression(user.organizationId, id);
  }

  @Get('domains')
  @RequirePermissions('automation.view')
  listDomains(@CurrentUser() user: AuthUser) {
    return this.service.listDomains(user.organizationId);
  }

  @Post('domains')
  @RequirePermissions('automation.campaign.create')
  createDomain(@CurrentUser() user: AuthUser, @Body() dto: CreateSenderDomainDto) {
    return this.service.createDomain(user.organizationId, dto);
  }

  @Patch('domains/:id')
  @RequirePermissions('automation.campaign.create')
  updateDomain(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateSenderDomainDto,
  ) {
    return this.service.updateDomain(user.organizationId, id, dto);
  }

  @Post('domains/:id/verify')
  @RequirePermissions('automation.campaign.create')
  verifyDomain(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.verifyDomain(user.organizationId, id);
  }

  @Post('domains/:id/check')
  @RequirePermissions('automation.campaign.create')
  checkDomain(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.checkDomain(user.organizationId, id);
  }

  @Delete('domains/:id')
  @RequirePermissions('automation.campaign.create')
  deleteDomain(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.deleteDomain(user.organizationId, id);
  }

  @Get('automations/recipes')
  @RequirePermissions('automation.view')
  listAutomationRecipes(@CurrentUser() user: AuthUser) {
    return this.service.listAutomationRecipes(user.organizationId);
  }

  @Get('automations/crm-stages')
  @RequirePermissions('automation.view')
  listCrmStages(@CurrentUser() user: AuthUser) {
    return this.service.listCrmStagesForAutomation(user.organizationId);
  }

  @Get('automations')
  @RequirePermissions('automation.view')
  listAutomations(@CurrentUser() user: AuthUser) {
    return this.service.listAutomations(user.organizationId);
  }

  @Post('automations/from-recipe')
  @RequirePermissions('automation.campaign.create')
  createAutomationFromRecipe(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateEmailAutomationFromRecipeDto,
  ) {
    return this.service.createAutomationFromRecipe(user.organizationId, dto);
  }

  @Post('automations')
  @RequirePermissions('automation.campaign.create')
  createAutomation(@CurrentUser() user: AuthUser, @Body() dto: CreateEmailAutomationDto) {
    return this.service.createAutomation(user.organizationId, dto);
  }

  @Patch('automations/:id')
  @RequirePermissions('automation.campaign.create')
  updateAutomation(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateEmailAutomationDto,
  ) {
    return this.service.updateAutomation(user.organizationId, id, dto);
  }

  @Delete('automations/:id')
  @RequirePermissions('automation.campaign.create')
  deleteAutomation(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.deleteAutomation(user.organizationId, id);
  }

  @Post('automations/:id/run')
  @RequirePermissions('automation.campaign.send')
  runAutomation(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.runAutomation(user.organizationId, id);
  }
}
