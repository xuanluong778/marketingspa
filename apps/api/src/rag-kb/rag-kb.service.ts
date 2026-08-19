import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateRagKbDto,
  ImportRagKbTextDto,
  ImportRagKbUrlDto,
  RagKbSearchDto,
  UpdateRagKbDto,
} from './dto/rag-kb.dto';
import {
  CrawlFetchError,
  CrawlValidationError,
  fetchAndExtractUrl,
} from '../chatbot-cskh/utils/website-crawl.util';
import {
  buildRagQuery,
  formatRagForPrompt,
  type RagPromptMode,
} from './rag-prompt.util';

const MAX_KB = 30;
const MAX_DOCS_PER_KB = 100;

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.trim().length / 4));
}

function estimateChunks(text: string): number {
  return splitContentChunks(text).length || 1;
}

/** Cùng logic ước lượng chunk khi index — dùng khi Xem đầy đủ. */
function splitContentChunks(text: string): string[] {
  const trimmed = String(text || '').trim();
  if (!trimmed) return [];
  // Ưu tiên tách theo đoạn trống; fallback theo dòng markdown / cửa sổ 800 ký tự
  const byPara = trimmed
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 40);
  if (byPara.length >= 2) return byPara.slice(0, 200);

  const byLine = trimmed
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 24);
  // Gom dòng ngắn thành cửa sổ ~600–900 ký tự để search tốt hơn
  if (byLine.length >= 4) {
    const windows: string[] = [];
    let buf = '';
    for (const line of byLine) {
      if (!buf) buf = line;
      else if (buf.length + line.length + 1 < 900) buf = `${buf}\n${line}`;
      else {
        windows.push(buf);
        buf = line;
        if (windows.length >= 200) break;
      }
    }
    if (buf && windows.length < 200) windows.push(buf);
    if (windows.length >= 2) return windows;
  }

  const out: string[] = [];
  for (let i = 0; i < trimmed.length; i += 700) {
    out.push(trimmed.slice(i, i + 900));
    if (out.length >= 200) break;
  }
  return out.length ? out : [trimmed];
}

const VI_STOPWORDS = new Set([
  'tôi',
  'mình',
  'bạn',
  'anh',
  'chị',
  'em',
  'ạ',
  'à',
  'ơi',
  'nhé',
  'nha',
  'với',
  'của',
  'cho',
  'các',
  'những',
  'được',
  'không',
  'có',
  'là',
  'và',
  'hoặc',
  'thì',
  'này',
  'kia',
  'đó',
  'ở',
  'đây',
  'sang',
  'qua',
  'rất',
  'quá',
  'muốn',
  'cần',
  'giúp',
  'xin',
  'hỏi',
  'về',
  'như',
  'thế',
  'nào',
  'gì',
  'sao',
  'để',
  'làm',
  'biết',
  'một',
  'cái',
]);

/** Đồng nghĩa nhẹ để bắt “dịch vụ marketing / SEO / ads”. */
const QUERY_SYNONYMS: Record<string, string[]> = {
  marketing: ['seo', 'quảng cáo', 'ads', 'facebook ads', 'content', 'truyền thông'],
  'dịch vụ': ['dịch vụ', 'gói', 'solution', 'dịch-vụ'],
  'tu van': ['tư vấn', 'consult'],
  'tư vấn': ['tư vấn', 'consult', 'hỗ trợ'],
  seo: ['seo', 'marketing', 'từ khóa'],
  website: ['website', 'web', 'thiết kế web'],
};

function stripViDiacritics(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

function expandQueryTokens(query: string): string[] {
  const raw = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const tokens = new Set<string>();
  // Unigrams (bỏ stopword ngắn)
  for (const t of raw) {
    if (t.length < 2) continue;
    if (VI_STOPWORDS.has(t)) continue;
    tokens.add(t);
    tokens.add(stripViDiacritics(t));
  }
  // Bigrams quan trọng: "dịch vụ", "tư vấn", "facebook ads"...
  for (let i = 0; i < raw.length - 1; i++) {
    const a = raw[i];
    const b = raw[i + 1];
    if (!a || !b) continue;
    if (VI_STOPWORDS.has(a) && VI_STOPWORDS.has(b)) continue;
    const bi = `${a} ${b}`;
    if (bi.length >= 4) {
      tokens.add(bi);
      tokens.add(stripViDiacritics(bi));
    }
  }
  // Synonyms
  for (const t of [...tokens]) {
    const syns = QUERY_SYNONYMS[t] || QUERY_SYNONYMS[stripViDiacritics(t)];
    if (!syns) continue;
    for (const s of syns) {
      tokens.add(s);
      tokens.add(stripViDiacritics(s));
    }
  }
  return [...tokens].filter((t) => t.length >= 2);
}

function scoreTextAgainstTokens(hayRaw: string, tokens: string[]): number {
  if (!tokens.length || !hayRaw) return 0;
  const hay = hayRaw.toLowerCase();
  const hayFold = stripViDiacritics(hay);
  let score = 0;
  for (const t of tokens) {
    const fold = stripViDiacritics(t);
    if (hay.includes(t) || hayFold.includes(fold)) {
      // Cụm từ (có khoảng trắng) nặng hơn unigram
      score += t.includes(' ') ? 3 : t.length >= 6 ? 2 : 1;
    }
  }
  return score;
}

/** Cửa sổ ~900 ký tự quanh vị trí khớp tốt nhất trong document. */
function bestWindowAroundMatch(content: string, tokens: string[], windowSize = 900): string {
  const text = content || '';
  if (text.length <= windowSize) return text;
  const low = text.toLowerCase();
  const fold = stripViDiacritics(low);
  let bestIdx = 0;
  let bestScore = -1;
  const step = Math.max(120, Math.floor(windowSize / 3));
  for (let i = 0; i < text.length; i += step) {
    const slice = text.slice(i, i + windowSize);
    const s = scoreTextAgainstTokens(slice, tokens);
    if (s > bestScore) {
      bestScore = s;
      bestIdx = i;
    }
  }
  // Ưu tiên vị trí xuất hiện token dài nhất
  for (const t of tokens.sort((a, b) => b.length - a.length)) {
    const idx = low.indexOf(t);
    const idx2 = fold.indexOf(stripViDiacritics(t));
    const hit = idx >= 0 ? idx : idx2;
    if (hit >= 0) {
      bestIdx = Math.max(0, hit - Math.floor(windowSize / 4));
      break;
    }
  }
  return text.slice(bestIdx, bestIdx + windowSize);
}

function formatTokenCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '')}k`;
  return String(n);
}

@Injectable()
export class RagKbService {
  constructor(private readonly prisma: PrismaService) {}

  private async findKbOrThrow(organizationId: string, id: string) {
    const kb = await this.prisma.ragKnowledgeBase.findFirst({
      where: { id, organizationId },
      include: { documents: { orderBy: { createdAt: 'desc' } } },
    });
    if (!kb) throw new NotFoundException('Không tìm thấy Knowledge Base');
    return kb;
  }

  private serializeKb(
    kb: Awaited<ReturnType<RagKbService['findKbOrThrow']>>,
  ) {
    const docs = kb.documents ?? [];
    const documentCount = docs.length;
    const chunkCount = docs.reduce((s, d) => s + d.chunkCount, 0);
    const embeddingCount = docs.reduce((s, d) => s + d.embeddingCount, 0);
    const tokenCount = docs.reduce((s, d) => s + d.tokenCount, 0);
    return {
      id: kb.id,
      name: kb.name,
      description: kb.description,
      isDefault: kb.isDefault,
      botId: (kb as { botId?: string | null }).botId ?? null,
      createdAt: kb.createdAt,
      updatedAt: kb.updatedAt,
      stats: {
        documentCount,
        chunkCount,
        embeddingCount,
        embeddingTotal: chunkCount,
        tokenCount,
        tokenLabel: formatTokenCount(tokenCount),
      },
      documents: docs.map((d) => ({
        id: d.id,
        title: d.title,
        sourceType: d.sourceType,
        url: d.url,
        chunkCount: d.chunkCount,
        tokenCount: d.tokenCount,
        embeddingCount: d.embeddingCount,
        status: d.status,
        preview: (d.content || '').slice(0, 200),
        createdAt: d.createdAt,
      })),
    };
  }

  async list(organizationId: string, botId?: string | null) {
    const rows = await this.prisma.ragKnowledgeBase.findMany({
      where: {
        organizationId,
        ...(botId ? { botId } : {}),
      },
      include: { documents: true },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
    return rows.map((kb) => this.serializeKb(kb));
  }

  async get(organizationId: string, id: string) {
    return this.serializeKb(await this.findKbOrThrow(organizationId, id));
  }

  async create(organizationId: string, dto: CreateRagKbDto) {
    const count = await this.prisma.ragKnowledgeBase.count({ where: { organizationId } });
    if (count >= MAX_KB) {
      throw new BadRequestException(`Tối đa ${MAX_KB} Knowledge Base.`);
    }

    if (dto.botId) {
      const bot = await this.prisma.chatbotBot.findFirst({
        where: { id: dto.botId, organizationId },
        select: { id: true },
      });
      if (!bot) throw new BadRequestException('botId không thuộc tổ chức này');
    }

    if (dto.isDefault) {
      await this.prisma.ragKnowledgeBase.updateMany({
        where: {
          organizationId,
          isDefault: true,
          ...(dto.botId ? { botId: dto.botId } : {}),
        },
        data: { isDefault: false },
      });
    }

    const kb = await this.prisma.ragKnowledgeBase.create({
      data: {
        organizationId,
        botId: dto.botId || null,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        isDefault: dto.isDefault ?? count === 0,
      },
      include: { documents: true },
    });
    return this.serializeKb(kb);
  }

  async update(organizationId: string, id: string, dto: UpdateRagKbDto) {
    await this.findKbOrThrow(organizationId, id);
    if (dto.botId) {
      const bot = await this.prisma.chatbotBot.findFirst({
        where: { id: dto.botId, organizationId },
        select: { id: true },
      });
      if (!bot) throw new BadRequestException('botId không thuộc tổ chức này');
    }
    if (dto.isDefault === true) {
      await this.prisma.ragKnowledgeBase.updateMany({
        where: { organizationId, isDefault: true },
        data: { isDefault: false },
      });
    }
    const kb = await this.prisma.ragKnowledgeBase.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description.trim() || null }
          : {}),
        ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
        ...(dto.botId !== undefined ? { botId: dto.botId || null } : {}),
      },
      include: { documents: true },
    });
    return this.serializeKb(kb);
  }

  async remove(organizationId: string, id: string) {
    await this.findKbOrThrow(organizationId, id);
    await this.prisma.ragKnowledgeBase.delete({ where: { id } });
    return { success: true };
  }

  private async addDocument(
    organizationId: string,
    knowledgeBaseId: string,
    data: {
      title: string;
      sourceType: string;
      url?: string | null;
      content: string;
    },
  ) {
    const docCount = await this.prisma.ragKbDocument.count({
      where: { knowledgeBaseId },
    });
    if (docCount >= MAX_DOCS_PER_KB) {
      throw new BadRequestException(`Tối đa ${MAX_DOCS_PER_KB} tài liệu / KB.`);
    }

    const content = data.content.trim().slice(0, 200_000);
    if (content.length < 10) {
      throw new BadRequestException('Nội dung tài liệu quá ngắn.');
    }

    const chunkCount = estimateChunks(content);
    const tokenCount = estimateTokens(content);

    await this.prisma.ragKbDocument.create({
      data: {
        organizationId,
        knowledgeBaseId,
        title: data.title.slice(0, 200),
        sourceType: data.sourceType,
        url: data.url?.slice(0, 2000) || null,
        content,
        chunkCount,
        tokenCount,
        embeddingCount: 0,
        status: 'ready',
      },
    });

    return this.get(organizationId, knowledgeBaseId);
  }

  async importText(organizationId: string, kbId: string, dto: ImportRagKbTextDto) {
    await this.findKbOrThrow(organizationId, kbId);
    return this.addDocument(organizationId, kbId, {
      title: dto.title,
      sourceType: 'TEXT',
      content: dto.content,
    });
  }

  async importFile(
    organizationId: string,
    kbId: string,
    file: { originalname?: string; buffer?: Buffer },
  ) {
    await this.findKbOrThrow(organizationId, kbId);
    const name = file.originalname || 'document.txt';
    if (!/\.(txt|md|markdown|csv|json)$/i.test(name)) {
      throw new BadRequestException('Chỉ hỗ trợ .txt, .md, .csv, .json');
    }
    if (!file.buffer?.length) throw new BadRequestException('File trống');
    if (file.buffer.length > 2 * 1024 * 1024) {
      throw new BadRequestException('File tối đa 2MB');
    }
    const content = file.buffer.toString('utf8');
    return this.addDocument(organizationId, kbId, {
      title: name.replace(/\.[^.]+$/, '').slice(0, 160) || 'Tài liệu',
      sourceType: 'FILE',
      content,
    });
  }

  async importUrl(organizationId: string, kbId: string, dto: ImportRagKbUrlDto) {
    await this.findKbOrThrow(organizationId, kbId);
    let result;
    try {
      result = await fetchAndExtractUrl(dto.url);
    } catch (e) {
      if (e instanceof CrawlValidationError || e instanceof CrawlFetchError) {
        throw new BadRequestException(e.message);
      }
      throw new BadRequestException('Không quét được website');
    }
    return this.addDocument(organizationId, kbId, {
      title: (dto.title || result.title || 'Website').slice(0, 200),
      sourceType: 'URL',
      url: result.pageUrl,
      content: result.content,
    });
  }

  async reindex(organizationId: string, kbId: string) {
    const kb = await this.findKbOrThrow(organizationId, kbId);
    await this.prisma.$transaction(
      kb.documents.map((d) => {
        const chunkCount = estimateChunks(d.content);
        const tokenCount = estimateTokens(d.content);
        return this.prisma.ragKbDocument.update({
          where: { id: d.id },
          data: {
            chunkCount,
            tokenCount,
            // Simulated index: mark embeddings ready = chunks
            embeddingCount: chunkCount,
            status: 'ready',
          },
        });
      }),
    );
    return this.get(organizationId, kbId);
  }

  async deleteDocument(organizationId: string, kbId: string, docId: string) {
    await this.findKbOrThrow(organizationId, kbId);
    const doc = await this.prisma.ragKbDocument.findFirst({
      where: { id: docId, knowledgeBaseId: kbId, organizationId },
    });
    if (!doc) throw new NotFoundException('Không tìm thấy tài liệu');
    await this.prisma.ragKbDocument.delete({ where: { id: docId } });
    return this.get(organizationId, kbId);
  }

  /** Chi tiết tài liệu — full content + chunks (để Xem đầy đủ trong UI). */
  async getDocument(organizationId: string, kbId: string, docId: string) {
    await this.findKbOrThrow(organizationId, kbId);
    const doc = await this.prisma.ragKbDocument.findFirst({
      where: { id: docId, knowledgeBaseId: kbId, organizationId },
    });
    if (!doc) throw new NotFoundException('Không tìm thấy tài liệu');
    const content = doc.content || '';
    const chunks = splitContentChunks(content);
    return {
      id: doc.id,
      knowledgeBaseId: doc.knowledgeBaseId,
      title: doc.title,
      sourceType: doc.sourceType,
      url: doc.url,
      status: doc.status,
      chunkCount: doc.chunkCount,
      tokenCount: doc.tokenCount,
      embeddingCount: doc.embeddingCount,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      content,
      contentLength: content.length,
      chunks: chunks.map((text, index) => ({
        index: index + 1,
        text,
        charCount: text.length,
        tokenEstimate: estimateTokens(text),
      })),
    };
  }

  /** Tải về dạng file text (UTF-8). */
  async downloadDocument(organizationId: string, kbId: string, docId: string) {
    const doc = await this.getDocument(organizationId, kbId, docId);
    const safeName =
      doc.title
        .replace(/[^\w\u00C0-\u024F\u1E00-\u1EFF\-_. ]+/gi, '_')
        .trim()
        .slice(0, 80) || 'document';
    const filename = `${safeName}.txt`;
    const header = [
      `Title: ${doc.title}`,
      `Source: ${doc.sourceType}${doc.url ? ` (${doc.url})` : ''}`,
      `Status: ${doc.status}`,
      `Chunks: ${doc.chunkCount}`,
      `Tokens: ${doc.tokenCount}`,
      `Exported: ${new Date().toISOString()}`,
      '',
      '-----',
      '',
    ].join('\n');
    return {
      filename,
      mimeType: 'text/plain; charset=utf-8',
      body: `${header}${doc.content}`,
    };
  }

  async search(organizationId: string, dto: RagKbSearchDto) {
    const query = dto.query.trim().toLowerCase();
    const tokens = query.split(/\s+/).filter((t) => t.length >= 2);
    const kbs = await this.prisma.ragKnowledgeBase.findMany({
      where: {
        organizationId,
        ...(dto.knowledgeBaseId ? { id: dto.knowledgeBaseId } : {}),
      },
      include: { documents: true },
    });

    const hits: Array<{
      knowledgeBaseId: string;
      knowledgeBaseName: string;
      documentId: string;
      title: string;
      score: number;
      excerpt: string;
    }> = [];

    for (const kb of kbs) {
      for (const doc of kb.documents) {
        if (!['ready', 'active', 'indexed'].includes(doc.status)) continue;
        const hay = `${doc.title} ${doc.content}`.toLowerCase();
        const score = tokens.length
          ? tokens.reduce((a, t) => a + (hay.includes(t) ? 1 : 0), 0)
          : hay.includes(query)
            ? 1
            : 0;
        if (score <= 0) continue;
        const idx = hay.indexOf(tokens[0] || query);
        const start = Math.max(0, idx - 60);
        hits.push({
          knowledgeBaseId: kb.id,
          knowledgeBaseName: kb.name,
          documentId: doc.id,
          title: doc.title,
          score,
          excerpt: doc.content.slice(start, start + 220),
        });
      }
    }

    hits.sort((a, b) => b.score - a.score);
    return { query: dto.query, results: hits.slice(0, 20) };
  }

  /**
   * Retrieval cho Chatbot CSKH — luôn lọc theo organizationId (tenant isolation).
   * Keyword + phrase + synonym trên dữ liệu live (thêm/sửa/xóa KB có hiệu lực ngay).
   * Ngưỡng mềm: chỉ cần score > 0 (1 token/cụm khớp là đủ).
   */
  /**
   * Retrieval cho Chatbot CSKH — luôn lọc theo organizationId + botId (Project isolation).
   * Không bao giờ lấy KB của Project/Bot khác trong cùng org.
   */
  async searchForChatContext(
    organizationId: string,
    query: string,
    options?: {
      limit?: number;
      knowledgeBaseId?: string;
      minScore?: number;
      /** Bắt buộc cho CSKH — chỉ search KB gắn Project/Bot này */
      botId?: string;
      /** Tên Fanpage — boost KB cùng brand trong Project */
      pageName?: string;
    },
  ): Promise<
    Array<{
      sourceId: string;
      title: string;
      sourceType: string;
      content: string;
      score: number;
      knowledgeBaseId: string;
      knowledgeBaseName: string;
    }>
  > {
    const limit = Math.min(8, Math.max(1, options?.limit ?? 5));
    /** Ngưỡng thấp — tránh mất hit phù hợp (mặc định 1). */
    const minScore = Math.max(1, options?.minScore ?? 1);
    const q = String(query || '').trim();
    if (!organizationId || !q) return [];

    const tokens = expandQueryTokens(q);
    if (!tokens.length) return [];

    // Project scope khi có botId: chỉ KB của bot đó (không lấy bot khác / unassigned)
    const pageFold = stripViDiacritics(String(options?.pageName || '').toLowerCase()).replace(
      /\s+/g,
      ' ',
    );

    const docs = await this.prisma.ragKbDocument.findMany({
      where: {
        organizationId,
        status: { in: ['ready', 'active', 'indexed'] },
        ...(options?.knowledgeBaseId
          ? { knowledgeBaseId: options.knowledgeBaseId }
          : {}),
        knowledgeBase: {
          organizationId,
          ...(options?.botId ? { botId: options.botId } : {}),
          ...(options?.knowledgeBaseId ? { id: options.knowledgeBaseId } : {}),
        },
      },
      include: {
        knowledgeBase: {
          select: { id: true, name: true, isDefault: true, organizationId: true, botId: true },
        },
      },
      take: 200,
    });

    type Hit = {
      sourceId: string;
      title: string;
      sourceType: string;
      content: string;
      score: number;
      knowledgeBaseId: string;
      knowledgeBaseName: string;
    };
    const hits: Hit[] = [];

    for (const doc of docs) {
      if (
        doc.organizationId !== organizationId ||
        doc.knowledgeBase.organizationId !== organizationId
      ) {
        continue;
      }
      // Defense: KB phải thuộc đúng bot khi botId được truyền
      if (options?.botId && doc.knowledgeBase.botId !== options.botId) {
        continue;
      }

      const kbNameFold = stripViDiacritics(doc.knowledgeBase.name.toLowerCase()).replace(
        /\s+/g,
        ' ',
      );
      let kbBoost = doc.knowledgeBase.isDefault ? 0.5 : 0;
      if (pageFold) {
        const pageTokens = pageFold.split(' ').filter((t) => t.length >= 3);
        const overlap = pageTokens.filter((t) => kbNameFold.includes(t)).length;
        if (overlap >= 2 || (pageFold.includes('digi') && kbNameFold.includes('digi'))) {
          kbBoost += 25;
        } else if (
          /spa|tham my|suong/.test(kbNameFold) &&
          /digi|seo|marketing|website/.test(pageFold)
        ) {
          kbBoost -= 40;
        }
      }

      const titleScore = scoreTextAgainstTokens(doc.title || '', tokens);
      const fullScore = scoreTextAgainstTokens(doc.content || '', tokens);
      if (fullScore + titleScore < minScore) continue;

      const chunks = splitContentChunks(doc.content || '');
      const candidateChunks = chunks.length ? chunks : [doc.content || ''];
      let pushedForDoc = 0;

      const qFold = stripViDiacritics(q.toLowerCase());
      const wantsServices =
        /dich vu|marketing|seo|tu van|goi|quang cao|ads|website|ben minh|co .*gi/.test(qFold);

      for (const chunk of candidateChunks) {
        const chunkScore = scoreTextAgainstTokens(chunk, tokens);
        if (chunkScore < minScore && titleScore < minScore) continue;
        let score = chunkScore + titleScore * 0.5 + kbBoost;
        const chunkFold = stripViDiacritics(chunk.toLowerCase());
        if (wantsServices) {
          const numberedServices = (chunk.match(/\d\.\s+/g) || []).length;
          if (
            /dich vu seo|thiet ke website|dao tao|facebook ads|cham soc website|entity\/backlink/.test(
              chunkFold,
            ) ||
            numberedServices >= 3
          ) {
            score += 20;
          }
          if (/ten fanpage|facebook\.com\/|muc dich su dung/.test(chunkFold) && numberedServices < 2) {
            score -= 15;
          }
        }
        if (score < minScore) continue;
        hits.push({
          sourceId: doc.id,
          title: `${doc.knowledgeBase.name} · ${doc.title}`,
          sourceType: 'RAG_KB',
          content: chunk.slice(0, 4000),
          score,
          knowledgeBaseId: doc.knowledgeBaseId,
          knowledgeBaseName: doc.knowledgeBase.name,
        });
        pushedForDoc += 1;
      }

      if (pushedForDoc === 0 && fullScore + titleScore >= minScore) {
        const window = bestWindowAroundMatch(doc.content || '', tokens);
        hits.push({
          sourceId: doc.id,
          title: `${doc.knowledgeBase.name} · ${doc.title}`,
          sourceType: 'RAG_KB',
          content: window.slice(0, 4000),
          score: fullScore + titleScore + kbBoost,
          knowledgeBaseId: doc.knowledgeBaseId,
          knowledgeBaseName: doc.knowledgeBase.name,
        });
      }
    }

    hits.sort((a, b) => b.score - a.score || b.content.length - a.content.length);

    const seen = new Set<string>();
    const out: Hit[] = [];
    for (const h of hits) {
      const key = `${h.sourceId}:${h.content.slice(0, 80)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(h);
      if (out.length >= limit) break;
    }
    return out;
  }

  /**
   * Block prompt dùng chung cho Content / Assistant / Auto-post / Ads / Chat.
   * Fail-open: lỗi DB → chuỗi rỗng (không chặn tính năng).
   */
  async getPromptBlock(
    organizationId: string,
    query: string,
    options?: { limit?: number; mode?: RagPromptMode; knowledgeBaseId?: string },
  ): Promise<string> {
    if (!organizationId) return '';
    const q = buildRagQuery(query);
    if (!q) return '';
    try {
      const hits = await this.searchForChatContext(organizationId, q, {
        limit: options?.limit ?? 5,
        knowledgeBaseId: options?.knowledgeBaseId,
      });
      return formatRagForPrompt(hits, options?.mode ?? 'content');
    } catch {
      return '';
    }
  }
}
