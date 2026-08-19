import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

/** Mirror packages/shared/src/credit.ts — tránh phụ thuộc workspace trong seed DB */
const FEATURE = {
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

const DEFAULT_PRICING: Array<{
  featureCode: string;
  name: string;
  creditCost: number;
  description: string;
  sortOrder: number;
}> = [
  {
    featureCode: FEATURE.CONTENT_AI_GENERATE,
    name: 'Content AI — tạo nội dung',
    creditCost: 5,
    description: 'Sinh caption/script/bài viết',
    sortOrder: 10,
  },
  {
    featureCode: FEATURE.CONTENT_AI_IMAGE,
    name: 'Content AI — hình ảnh',
    creditCost: 8,
    description: 'Sinh ảnh AI cho content',
    sortOrder: 20,
  },
  {
    featureCode: FEATURE.ASSISTANT_CHAT,
    name: 'Trợ lý AI — chat',
    creditCost: 2,
    description: 'Hội thoại trợ lý điều hành',
    sortOrder: 30,
  },
  {
    featureCode: FEATURE.ASSISTANT_WRITE,
    name: 'Trợ lý AI — soạn thảo',
    creditCost: 4,
    description: 'Soạn email/báo cáo qua trợ lý',
    sortOrder: 40,
  },
  {
    featureCode: FEATURE.CHATBOT_REPLY,
    name: 'Chatbot CSKH — trả lời AI',
    creditCost: 1,
    description: 'Một lượt trả lời chatbot',
    sortOrder: 50,
  },
  {
    featureCode: FEATURE.VIDEO_TRANSCRIBE,
    name: 'Video — phiên âm',
    creditCost: 10,
    description: 'Transcribe video teleprompter',
    sortOrder: 60,
  },
  {
    featureCode: FEATURE.FUNNEL_AI_SUGGEST,
    name: 'Funnel — gợi ý AI',
    creditCost: 6,
    description: 'Gợi ý funnel/canvas bằng AI',
    sortOrder: 70,
  },
  {
    featureCode: FEATURE.EMAIL_AI_SUBJECT,
    name: 'Email — tiêu đề AI',
    creditCost: 2,
    description: 'Sinh subject line email',
    sortOrder: 80,
  },
  {
    featureCode: FEATURE.ADS_AI_CREATIVE,
    name: 'Ads — creative AI',
    creditCost: 7,
    description: 'Sinh ý tưởng quảng cáo',
    sortOrder: 90,
  },
  {
    featureCode: FEATURE.RAG_QUERY,
    name: 'Knowledge base — truy vấn RAG',
    creditCost: 3,
    description: 'Truy vấn cơ sở tri thức',
    sortOrder: 100,
  },
  {
    featureCode: FEATURE.AI_ANALYSIS,
    name: 'AI — phân tích (policy, video, URL ads)',
    creditCost: 4,
    description: 'Phân tích nội dung/quảng cáo bằng AI',
    sortOrder: 110,
  },
];

async function main() {
  for (const row of DEFAULT_PRICING) {
    await prisma.creditFeaturePricing.upsert({
      where: { featureCode: row.featureCode },
      update: {
        name: row.name,
        creditCost: new Decimal(row.creditCost),
        description: row.description,
        sortOrder: row.sortOrder,
        isActive: true,
      },
      create: {
        featureCode: row.featureCode,
        name: row.name,
        creditCost: new Decimal(row.creditCost),
        description: row.description,
        sortOrder: row.sortOrder,
        isActive: true,
      },
    });
  }
  const rows = await prisma.creditFeaturePricing.findMany({ orderBy: { sortOrder: 'asc' } });
  console.log(rows.map((r) => ({ code: r.featureCode, cost: String(r.creditCost) })));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
