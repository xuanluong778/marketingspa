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
import { ChatbotCskhService } from './chatbot-cskh.service';
import { ChatbotSuggestService } from './chatbot-suggest.service';
import { ChatbotFacebookWebhookService } from './chatbot-facebook-webhook.service';
import { OpenAiService } from '../openai/openai.service';
import { RealtimeBridgeService } from '../events/realtime-bridge.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import {
  ConnectFacebookPageDto,
  CreateChannelDto,
  CreateChatbotBotDto,
  CreateKnowledgeSourceDto,
  CrawlKnowledgeUrlDto,
  UpdateChatbotBotDto,
  UpdateSettingsDto,
} from './dto/chatbot-cskh.dto';
import { ChatbotOptionsQueryDto, ChatbotSuggestDto } from './dto/chatbot-suggest.dto';

@Controller('chatbot-cskh')
@UseGuards(JwtAuthGuard, TenantGuard)
export class ChatbotCskhController {
  constructor(
    private readonly service: ChatbotCskhService,
    private readonly suggestService: ChatbotSuggestService,
    private readonly openAi: OpenAiService,
    private readonly facebookWebhook: ChatbotFacebookWebhookService,
    private readonly realtimeBridge: RealtimeBridgeService,
  ) {}

  @Get('options')
  getOptions(@Query() query: ChatbotOptionsQueryDto) {
    return this.suggestService.getOptions(query.industry);
  }

  @Post('suggest')
  suggest(@CurrentUser() user: AuthUser, @Body() dto: ChatbotSuggestDto) {
    return this.suggestService.suggest(dto, user.organizationId);
  }

  @Get('overview')
  overview(@CurrentUser() user: AuthUser) {
    return this.service.getOverview(user.organizationId);
  }

  @Get('bots')
  listBots(@CurrentUser() user: AuthUser) {
    return this.service.listBots(user.organizationId);
  }

  @Post('bots')
  createBot(@CurrentUser() user: AuthUser, @Body() dto: CreateChatbotBotDto) {
    return this.service.createBot(user.organizationId, dto);
  }

  @Get('bots/:id')
  getBot(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.getBot(user.organizationId, id);
  }

  @Patch('bots/:id')
  updateBot(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateChatbotBotDto,
  ) {
    return this.service.updateBot(user.organizationId, id, dto);
  }

  @Delete('bots/:id')
  deleteBot(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.deleteBot(user.organizationId, id);
  }

  @Get('bots/:id/embed')
  embed(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.getEmbedCode(user.organizationId, id);
  }

  @Get('knowledge')
  listKnowledge(@CurrentUser() user: AuthUser, @Query('botId') botId?: string) {
    return this.service.listKnowledge(user.organizationId, botId);
  }

  @Post('knowledge')
  createKnowledge(@CurrentUser() user: AuthUser, @Body() dto: CreateKnowledgeSourceDto) {
    return this.service.createKnowledge(user.organizationId, dto);
  }

  @Post('knowledge/diagram')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  uploadKnowledgeDiagram(
    @CurrentUser() user: AuthUser,
    @UploadedFile()
    file:
      | {
          originalname?: string;
          buffer?: Buffer;
        }
      | undefined,
    @Body()
    body: {
      botId?: string;
      title?: string;
      replaceExisting?: string;
    },
  ) {
    return this.service.uploadKnowledgeDiagram(user.organizationId, {
      botId: body.botId || '',
      title: body.title,
      filename: file?.originalname || 'diagram.txt',
      buffer: file?.buffer || Buffer.alloc(0),
      replaceExisting: body.replaceExisting === '1' || body.replaceExisting === 'true',
    });
  }

  @Post('knowledge/crawl')
  crawlKnowledgeFromUrl(@CurrentUser() user: AuthUser, @Body() dto: CrawlKnowledgeUrlDto) {
    return this.service.crawlKnowledgeFromUrl(user.organizationId, dto);
  }

  @Delete('knowledge/:id')
  deleteKnowledge(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.deleteKnowledge(user.organizationId, id);
  }

  @Get('channels')
  listChannels(@CurrentUser() user: AuthUser) {
    return this.service.listChannels(user.organizationId);
  }

  @Post('channels')
  createChannel(@CurrentUser() user: AuthUser, @Body() dto: CreateChannelDto) {
    return this.service.createChannel(user.organizationId, dto);
  }

  @Delete('channels/:id')
  deleteChannel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.deleteChannel(user.organizationId, id);
  }

  @Get('inbox/channel-options')
  listInboxChannelOptions(
    @CurrentUser() user: AuthUser,
    @Query('botId') botId?: string,
  ) {
    return this.service.listInboxChannelOptions(user.organizationId, botId || null);
  }

  @Get('inbox')
  listInbox(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('botId') botId?: string,
    @Query('channel') channel?: string,
    @Query('channelId') channelId?: string,
  ) {
    return this.service.listConversations(
      user.organizationId,
      limit ? Number(limit) : 25,
      cursor || null,
      {
        maxLimit: 50,
        botId: botId || null,
        channel: channel || null,
        channelId: channelId || null,
      },
    );
  }

  /** Badge + dropdown header — phải khai báo trước inbox/:id */
  @Get('inbox/unread-summary')
  getUnreadSummary(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: string,
    @Query('botId') botId?: string,
    @Query('channel') channel?: string,
    @Query('channelId') channelId?: string,
  ) {
    return this.service.getUnreadInboxSummary(
      user.organizationId,
      limit ? Number(limit) : 15,
      {
        botId: botId || null,
        channel: channel || null,
        channelId: channelId || null,
      },
    );
  }

  @Get('inbox/:id')
  getInbox(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.getConversation(user.organizationId, id);
  }

  @Post('inbox/:id/read')
  markInboxRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.markConversationRead(user.organizationId, id);
  }

  @Post('inbox/:id/takeover')
  takeover(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { employeeId?: string; resumeBot?: boolean },
  ) {
    return this.service.takeoverConversation(user.organizationId, id, body);
  }

  @Get('leads')
  listLeads(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    return this.service.listLeads(user.organizationId, limit ? Number(limit) : 50);
  }

  @Get('settings')
  getSettings(@CurrentUser() user: AuthUser) {
    return this.service.getSettings(user.organizationId);
  }

  @Get('openai/status')
  getOpenAiStatus(@Query('test') test?: string) {
    return this.openAi.getStatus(test === '1' || test === 'true');
  }

  @Patch('settings')
  updateSettings(@CurrentUser() user: AuthUser, @Body() dto: UpdateSettingsDto) {
    return this.service.updateSettings(user.organizationId, dto);
  }

  @Get('facebook/pages')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('automation.view')
  listFacebook(@CurrentUser() user: AuthUser, @Query('botId') botId?: string) {
    return this.service.listFacebookPages(user.organizationId, botId || null);
  }

  @Get('facebook/webhook-status')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('automation.view')
  async facebookWebhookStatus(@CurrentUser() user: AuthUser) {
    const status = await this.facebookWebhook.getPublicConnectStatus(user.organizationId);
    return {
      ...status,
      realtime: this.realtimeBridge.getStatus(),
    };
  }

  @Post('facebook/pages')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('automation.integration.manage')
  connectFacebook(@CurrentUser() user: AuthUser, @Body() dto: ConnectFacebookPageDto) {
    return this.service.connectFacebookPage(user.organizationId, dto);
  }

  @Post('facebook/pages/sync-messaging')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('automation.integration.manage')
  syncMessagingFromChatbot(@CurrentUser() user: AuthUser) {
    return this.service.syncMessagingFromChatbotPages(user.organizationId, user.id);
  }

  @Post('facebook/pages/resubscribe-webhooks')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('automation.integration.manage')
  resubscribeWebhooks(@CurrentUser() user: AuthUser) {
    // App callback URL + page subscribed_apps — thiếu app subscription thì Meta không gửi tin
    return this.facebookWebhook.ensureAppAndPageWebhooks();
  }

  @Delete('facebook/pages/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('automation.integration.manage')
  disconnectFacebook(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.disconnectFacebookPage(user.organizationId, id);
  }
}
