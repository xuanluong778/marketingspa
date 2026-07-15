export type ChatbotBotStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED';

export type ChatbotChannelType = 'WEBSITE_WIDGET' | 'FACEBOOK' | 'ZALO' | 'TELEGRAM' | 'API';

export type ChatbotSourceType = 'FAQ' | 'URL' | 'FILE' | 'MANUAL';

export interface ChatbotOverview {
  botsTotal: number;
  botsActive: number;
  sourcesTotal: number;
  channelsTotal: number;
  conversationsTotal: number;
  leadsToday: number;
  monthlyRepliesUsed: number;
  monthlyReplyLimit: number;
  repliesRemaining: number;
}

export interface ChatbotBot {
  id: string;
  organizationId: string;
  botName: string;
  websiteUrl?: string | null;
  businessName?: string | null;
  industry?: string | null;
  hotline?: string | null;
  mainServices?: string | null;
  consultationTone: string;
  greeting?: string | null;
  allowedDomains?: string | null;
  status: ChatbotBotStatus;
  embedCode?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatbotKnowledgeSource {
  id: string;
  botId: string;
  sourceType: ChatbotSourceType;
  title: string;
  url?: string | null;
  content?: string | null;
  status: string;
  createdAt: string;
}

export interface ChatbotChannel {
  id: string;
  name: string;
  channelType: ChatbotChannelType;
  status: string;
  botId?: string | null;
  bot?: { id: string; botName: string } | null;
  createdAt: string;
}

export interface ChatbotConversation {
  id: string;
  sessionId: string;
  channel: string;
  status: string;
  visitorName?: string | null;
  visitorPhone?: string | null;
  updatedAt: string;
  bot?: { id: string; botName: string };
  messages?: Array<{ id: string; role: string; message: string; createdAt: string }>;
  _count?: { messages: number };
}

export interface ChatbotLead {
  id: string;
  name?: string | null;
  phone?: string | null;
  need?: string | null;
  pageUrl?: string | null;
  status: string;
  createdAt: string;
  bot?: { id: string; botName: string };
}

export interface ChatbotSettings {
  model: string;
  temperature: number;
  systemPrompt?: string | null;
  greeting?: string | null;
  fallbackReply?: string | null;
  monthlyLimit: number;
}

export interface ChatbotOpenAiStatus {
  configured: boolean;
  model: string;
  baseUrl: string;
  ok: boolean;
  error?: string;
}

export interface ChatbotEmbedInfo {
  botId: string;
  embedCode: string;
  widgetUrl: string;
  publicApiUrl: string;
}

export interface ChatbotFacebookPage {
  id: string;
  pageId: string;
  pageName: string;
  aiEnabled: boolean;
  status: string;
  webhookSubscribed?: boolean;
  bot?: { id: string; botName: string };
}

export const CHANNEL_LABELS: Record<ChatbotChannelType, string> = {
  WEBSITE_WIDGET: 'Website Widget',
  FACEBOOK: 'Facebook Fanpage',
  ZALO: 'Zalo OA',
  TELEGRAM: 'Telegram',
  API: 'API tích hợp',
};

export const SOURCE_TYPE_LABELS: Record<ChatbotSourceType, string> = {
  FAQ: 'FAQ / Câu hỏi thường gặp',
  URL: 'Trang web',
  FILE: 'Tài liệu',
  MANUAL: 'Nhập tay',
};

export const BOT_STATUS_LABELS: Record<ChatbotBotStatus, string> = {
  DRAFT: 'Nháp',
  ACTIVE: 'Đang chạy',
  PAUSED: 'Tạm dừng',
};

export const TONE_OPTIONS = [
  { value: 'friendly', label: 'Thân thiện' },
  { value: 'professional', label: 'Chuyên nghiệp' },
  { value: 'enthusiastic', label: 'Nhiệt tình' },
  { value: 'concise', label: 'Ngắn gọn' },
];
