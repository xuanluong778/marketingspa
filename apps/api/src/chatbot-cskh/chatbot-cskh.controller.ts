import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ChatbotCskhService } from './chatbot-cskh.service';
import { ChatbotSuggestService } from './chatbot-suggest.service';
import { ChatbotFacebookWebhookService } from './chatbot-facebook-webhook.service';
import { OpenAiService } from '../openai/openai.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import {
  ConnectFacebookPageDto,
  CreateChannelDto,
  CreateChatbotBotDto,
  CreateKnowledgeSourceDto,
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
  ) {}

  @Get('options')
  getOptions(@Query() query: ChatbotOptionsQueryDto) {
    return this.suggestService.getOptions(query.industry);
  }

  @Post('suggest')
  suggest(@Body() dto: ChatbotSuggestDto) {
    return this.suggestService.suggest(dto);
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

  @Get('inbox')
  listInbox(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    return this.service.listConversations(user.organizationId, limit ? Number(limit) : 50);
  }

  @Get('inbox/:id')
  getInbox(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.getConversation(user.organizationId, id);
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
  listFacebook(@CurrentUser() user: AuthUser) {
    return this.service.listFacebookPages(user.organizationId);
  }

  @Get('facebook/webhook-status')
  facebookWebhookStatus() {
    return {
      ok: true,
      webhookPath: this.facebookWebhook.getWebhookPath(),
      webhookUrl: this.facebookWebhook.getWebhookUrl(),
      verifyTokenHint: 'CSKH_FB_WEBHOOK_VERIFY_TOKEN',
      mode: 'page_token_only',
    };
  }

  @Post('facebook/pages')
  connectFacebook(@CurrentUser() user: AuthUser, @Body() dto: ConnectFacebookPageDto) {
    return this.service.connectFacebookPage(user.organizationId, dto);
  }

  @Delete('facebook/pages/:id')
  disconnectFacebook(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.disconnectFacebookPage(user.organizationId, id);
  }
}
