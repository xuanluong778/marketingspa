/** AI Credit feature codes — dùng chung API/worker, không hard-code chi phí rải rác */
export const CREDIT_FEATURE_CODES = {
  CONTENT_AI_GENERATE: 'content_ai.generate',
  CONTENT_AI_IMAGE: 'content_ai.image',
  ASSISTANT_CHAT: 'assistant.chat',
  ASSISTANT_WRITE: 'assistant.write',
  CHATBOT_REPLY: 'chatbot.reply',
  VIDEO_TRANSCRIBE: 'video.transcribe',
  FUNNEL_AI_SUGGEST: 'funnel.ai_suggest',
  EMAIL_AI_SUBJECT: 'email_ai.subject',
  ADS_AI_CREATIVE: 'ads_ai.creative',
  RAG_QUERY: 'rag.query',
  AI_ANALYSIS: 'ai.analysis',
} as const;

export type CreditFeatureCode = (typeof CREDIT_FEATURE_CODES)[keyof typeof CREDIT_FEATURE_CODES];

export type CreditBalanceSnapshot = {
  organizationId: string;
  balance: number;
  reservedBalance: number;
  available: number;
  lifetimeEarned: number;
  lifetimeUsed: number;
};

export type CreditMutationResult = {
  transactionId: string;
  idempotent: boolean;
  balance: CreditBalanceSnapshot;
};

export type CreditReserveParams = {
  organizationId: string;
  amount: number;
  referenceId: string;
  idempotencyKey: string;
  featureCode?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
};

export type CreditCommitParams = {
  organizationId: string;
  referenceId: string;
  idempotencyKey: string;
  featureCode?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
};

export type CreditReleaseParams = {
  organizationId: string;
  referenceId: string;
  idempotencyKey: string;
  reason?: string;
  metadata?: Record<string, unknown>;
};

/** Nguồn cấp Credit — không hard-code số lượng; số lấy từ Plan/TrialSetting/admin input */
export const CREDIT_GRANT_SOURCES = {
  TRIAL: 'TRIAL',
  PURCHASE: 'PURCHASE',
  RENEWAL: 'RENEWAL',
  ADMIN_GIFT: 'ADMIN_GIFT',
} as const;

export type CreditGrantSource = (typeof CREDIT_GRANT_SOURCES)[keyof typeof CREDIT_GRANT_SOURCES];

export type CreditGrantParams = {
  organizationId: string;
  amount: number;
  idempotencyKey: string;
  referenceId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  userId?: string;
  source?: CreditGrantSource | string;
  subscriptionId?: string;
  paymentId?: string;
};

export type CreditPurchaseParams = CreditGrantParams;

export type CreditRefundParams = {
  organizationId: string;
  amount: number;
  idempotencyKey: string;
  referenceId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
};

export type CreditAdjustParams = {
  organizationId: string;
  /** positive = cộng, negative = trừ */
  delta: number;
  idempotencyKey: string;
  referenceId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
};

export type CreditUsageParams = {
  organizationId: string;
  /** Bỏ qua khi có featureCode — lấy từ CreditFeaturePricing */
  amount?: number;
  idempotencyKey: string;
  referenceId?: string;
  featureCode?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
};

export function creditAvailable(balance: number, _reservedBalance = 0): number {
  return Math.max(0, balance);
}

/** Cảnh báo UI khi số dư còn lại dưới ngưỡng này (Credit = 0 thì khóa tác vụ AI). */
export const CREDIT_LOW_THRESHOLD = 100;

export const CREDIT_IN_TYPES = ['GRANT', 'PURCHASE', 'REFUND', 'RELEASE'] as const;
export const CREDIT_OUT_TYPES = ['USAGE', 'RESERVE'] as const;

export const CREDIT_FEATURE_LABELS: Record<string, string> = {
  'content_ai.generate': 'Tạo nội dung AI',
  'content_ai.image': 'Tạo hình ảnh AI',
  'assistant.chat': 'Trợ lý AI — chat',
  'assistant.write': 'Trợ lý AI — soạn thảo',
  'chatbot.reply': 'Chatbot CSKH',
  'video.transcribe': 'Phiên âm video',
  'funnel.ai_suggest': 'Gợi ý phễu AI',
  'email_ai.subject': 'Tiêu đề email AI',
  'ads_ai.creative': 'Creative quảng cáo AI',
  'rag.query': 'Truy vấn knowledge base',
  'ai.analysis': 'Phân tích AI',
};

export const CREDIT_TYPE_LABELS: Record<string, string> = {
  GRANT: 'Nhận credit',
  PURCHASE: 'Mua credit',
  USAGE: 'Sử dụng',
  RESERVE: 'Tạm giữ',
  RELEASE: 'Hoàn tạm giữ',
  REFUND: 'Hoàn credit',
  ADMIN_ADJUST: 'Điều chỉnh admin',
};

export function signedCreditAmount(
  type: string,
  amount: number,
  metadata?: Record<string, unknown> | null,
): number {
  const abs = Math.abs(Number(amount) || 0);
  if (type === 'ADMIN_ADJUST') {
    const delta = metadata && typeof metadata.delta === 'number' ? metadata.delta : null;
    if (delta != null && Number.isFinite(delta) && delta !== 0) return delta;
  }
  if ((CREDIT_IN_TYPES as readonly string[]).includes(type)) return abs;
  if ((CREDIT_OUT_TYPES as readonly string[]).includes(type)) return -abs;
  return abs;
}

export function creditFeatureLabel(
  featureCode?: string | null,
  type?: string | null,
  reason?: string | null,
): string {
  if (featureCode && CREDIT_FEATURE_LABELS[featureCode]) return CREDIT_FEATURE_LABELS[featureCode];
  if (reason?.trim()) return reason.trim();
  if (type && CREDIT_TYPE_LABELS[type]) return CREDIT_TYPE_LABELS[type];
  return 'AI Credit';
}
