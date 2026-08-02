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

const MAX_KB = 30;
const MAX_DOCS_PER_KB = 100;

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.trim().length / 4));
}

function estimateChunks(text: string): number {
  const parts = text
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 40);
  if (parts.length >= 2) return Math.min(200, parts.length);
  return Math.max(1, Math.ceil(text.length / 800));
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

  async list(organizationId: string) {
    const rows = await this.prisma.ragKnowledgeBase.findMany({
      where: { organizationId },
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

    if (dto.isDefault) {
      await this.prisma.ragKnowledgeBase.updateMany({
        where: { organizationId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const kb = await this.prisma.ragKnowledgeBase.create({
      data: {
        organizationId,
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
}
