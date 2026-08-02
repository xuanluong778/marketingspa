/**
 * POST /content-marketing/opinion/analyze
 * Resolve source (website SSRF-safe / Facebook Graph / paste / transcript) → structured AI brief.
 */
import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service';
import type { OpenAiService } from '../openai/openai.service';
import { CrawlValidationError } from '../chatbot-cskh/utils/website-crawl.util';
import { importPolicyUrl } from './facebook-policy/facebook-policy-import.logic';
import { detectPolicyUrlKind } from './facebook-policy/facebook-policy-url-parse';
import type { OpinionAnalyzeDto } from './dto/content-marketing.dto';

export type OpinionAnalyzeResult = {
  sourceSummary: string;
  confirmedFacts: string[];
  unverifiedClaims: string[];
  mainControversy: string;
  suggestedAngles: string[];
  missingInformation: string[];
  warnings: string[];
  /** Extras for client (optional) */
  extractedText?: string;
  sourceType?: string;
  insufficientData?: boolean;
  message?: string;
  analysisSource?: 'ai' | 'template';
};

const SINGLE_SOURCE_WARNING =
  'Thông tin chưa được kiểm chứng từ nhiều phía';

const DEFAULT_ANGLES = [
  'Cuộc sống',
  'Đạo đức',
  'Trách nhiệm cộng đồng',
  'Bài học cá nhân',
  'Kinh doanh',
];

function emptyResult(partial?: Partial<OpinionAnalyzeResult>): OpinionAnalyzeResult {
  return {
    sourceSummary: '',
    confirmedFacts: [],
    unverifiedClaims: [],
    mainControversy: '',
    suggestedAngles: [],
    missingInformation: [],
    warnings: [],
    insufficientData: true,
    ...partial,
  };
}

function ensureSingleSourceWarning(warnings: string[], sourceCount: number): string[] {
  const out = [...warnings];
  if (sourceCount <= 1 && !out.some((w) => w.includes('chưa được kiểm chứng'))) {
    out.push(SINGLE_SOURCE_WARNING);
  }
  return out;
}

function templateOpinionAnalyze(sourceText: string): OpinionAnalyzeResult {
  const text = sourceText.trim().slice(0, 4000);
  const first =
    text.split(/\n/).find((l) => l.trim())?.trim() ||
    'Sự việc đang được bàn luận trên dư luận.';
  const claimish = Array.from(
    text.matchAll(
      /(?:bị cáo buộc|bị tố|người ta nói|đồn rằng|theo tin đồn|có ý kiến cho rằng)[^.!?\n]{0,120}/giu,
    ),
  )
    .map((m) => m[0].trim())
    .slice(0, 4);
  const factish = Array.from(
    text.matchAll(
      /(?:theo|ngày|tại|xảy ra|được ghi nhận|cơ quan|cảnh sát|bệnh viện)[^.!?\n]{10,140}/giu,
    ),
  )
    .map((m) => m[0].trim())
    .slice(0, 4);

  return {
    sourceSummary: first.slice(0, 280) + (first.length > 280 ? '…' : ''),
    confirmedFacts:
      factish.length > 0
        ? factish
        : ['Chỉ có mô tả từ một nguồn — chưa đủ để xác nhận dữ kiện độc lập.'],
    unverifiedClaims:
      claimish.length > 0
        ? claimish
        : ['Các nhận định mang tính ý kiến / cáo buộc trong nguồn chưa được đối chiếu.'],
    mainControversy:
      'Công chúng đang bất đồng về cách đánh giá đúng–sai và trách nhiệm liên quan sự việc (chưa kết luận).',
    suggestedAngles: DEFAULT_ANGLES.slice(0, 5),
    missingInformation: [
      'Thiếu phản hồi từ các bên liên quan',
      'Thiếu nguồn độc lập thứ hai',
      'Thiếu timeline / bằng chứng gốc nếu có',
    ],
    warnings: [SINGLE_SOURCE_WARNING],
    extractedText: text.slice(0, 8000),
    insufficientData: text.length < 40,
    analysisSource: 'template',
  };
}

async function resolveSourceText(params: {
  dto: OpinionAnalyzeDto;
  userId: string;
  organizationId: string;
  prisma: PrismaService;
  config: ConfigService;
}): Promise<{
  text: string;
  sourceType: string;
  warnings: string[];
  sourceCount: number;
  insufficientData: boolean;
  message?: string;
}> {
  const warnings: string[] = [];
  const parts: string[] = [];
  let sourceType = 'manual';
  let insufficientData = false;
  let message: string | undefined;

  const pasted = (params.dto.sourceText ?? '').trim();
  const transcript = (params.dto.transcript ?? '').trim();
  const url = (params.dto.sourceUrl ?? '').trim();

  if (pasted) {
    parts.push(pasted);
    sourceType = 'paste';
  }
  if (transcript) {
    parts.push(`[Transcript]\n${transcript}`);
    if (sourceType === 'manual') sourceType = 'transcript';
  }

  if (url) {
    try {
      const kind = detectPolicyUrlKind(url, params.dto.urlKind);
      const imported = await importPolicyUrl({
        url,
        urlKind: kind === 'unknown' ? 'website' : kind,
        fanpageId: params.dto.fanpageId,
        userId: params.userId,
        organizationId: params.organizationId,
        prisma: params.prisma,
        config: params.config,
      });
      sourceType = imported.sourceType;
      warnings.push(...(imported.warnings || []));
      if (imported.insufficientData) {
        insufficientData = true;
        message =
          imported.message ||
          'Không lấy đủ nội dung từ URL — hãy dán nội dung hoặc transcript thủ công.';
      }
      const chunk = [imported.headline, imported.primaryText, imported.description]
        .filter(Boolean)
        .join('\n\n')
        .trim();
      if (chunk) parts.push(chunk);
      else if (!pasted && !transcript) {
        insufficientData = true;
        message =
          message ||
          'Không lấy được nội dung từ URL — hãy dán nội dung hoặc transcript thủ công.';
      }
    } catch (e) {
      if (e instanceof CrawlValidationError || e instanceof BadRequestException) {
        throw e instanceof BadRequestException
          ? e
          : new BadRequestException(e.message);
      }
      warnings.push(e instanceof Error ? e.message : 'Lỗi khi tải URL');
      if (!pasted && !transcript) {
        return {
          text: '',
          sourceType: 'url_failed',
          warnings,
          sourceCount: 0,
          insufficientData: true,
          message: 'Không lấy được nội dung từ URL — hãy dán nội dung hoặc transcript thủ công.',
        };
      }
    }
  }

  const text = parts.join('\n\n').trim();
  // Count discrete source channels (url fetch vs paste vs transcript)
  let sourceCount = 0;
  if (url && text) sourceCount += 1;
  if (pasted) sourceCount += 1;
  if (transcript) sourceCount += 1;
  if (sourceCount === 0 && text) sourceCount = 1;

  if (!text) {
    return {
      text: '',
      sourceType,
      warnings,
      sourceCount: 0,
      insufficientData: true,
      message:
        message ||
        'Thiếu nội dung nguồn. Cung cấp URL, dán nội dung hoặc transcript thủ công.',
    };
  }

  return {
    text,
    sourceType,
    warnings,
    sourceCount: Math.max(1, sourceCount),
    insufficientData: insufficientData || text.length < 40,
    message,
  };
}

async function aiOpinionAnalyze(
  sourceText: string,
  openai: OpenAiService,
): Promise<OpinionAnalyzeResult> {
  const prompt = `Bạn là biên tập viên trung lập (tiếng Việt). Phân tích nguồn tin dưới đây để phục vụ viết chính kiến.

QUY TẮC BẮT BUỘC:
- Tóm tắt ngắn gọn, đúng nguồn — không thêm tình tiết.
- Phân biệt rõ: dữ kiện có thể xác nhận từ nguồn vs lời cáo buộc / ý kiến chưa kiểm chứng.
- KHÔNG kết luận ai đúng hoặc sai.
- KHÔNG bịa phát ngôn, động cơ, hoặc tình tiết không có trong nguồn.
- Nếu chỉ thấy một nguồn, thêm cảnh báo đúng câu: "${SINGLE_SOURCE_WARNING}"
- Gợi ý 3–5 góc nhìn để người dùng chọn (Cuộc sống / Đạo đức / Cộng đồng / Kinh doanh / Người nổi tiếng / Bài học cá nhân…).

Trả JSON thuần đúng schema:
{
  "sourceSummary": "",
  "confirmedFacts": [],
  "unverifiedClaims": [],
  "mainControversy": "",
  "suggestedAngles": [],
  "missingInformation": [],
  "warnings": []
}

Nguồn:
"""
${sourceText.slice(0, 7000)}
"""`;

  const raw = await openai.chatCompletion({
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 1200,
    temperature: 0.2,
  });
  const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()) as Partial<OpinionAnalyzeResult>;
  const fallback = templateOpinionAnalyze(sourceText);
  const warnings = ensureSingleSourceWarning(
    Array.isArray(parsed.warnings) ? parsed.warnings.filter(Boolean) : fallback.warnings,
    1,
  );
  const angles = Array.isArray(parsed.suggestedAngles)
    ? parsed.suggestedAngles.filter(Boolean).slice(0, 5)
    : fallback.suggestedAngles;
  return {
    sourceSummary: (parsed.sourceSummary || fallback.sourceSummary).trim(),
    confirmedFacts: Array.isArray(parsed.confirmedFacts)
      ? parsed.confirmedFacts.filter(Boolean).slice(0, 8)
      : fallback.confirmedFacts,
    unverifiedClaims: Array.isArray(parsed.unverifiedClaims)
      ? parsed.unverifiedClaims.filter(Boolean).slice(0, 8)
      : fallback.unverifiedClaims,
    mainControversy: (parsed.mainControversy || fallback.mainControversy).trim(),
    suggestedAngles: angles.length >= 3 ? angles : DEFAULT_ANGLES.slice(0, 5),
    missingInformation: Array.isArray(parsed.missingInformation)
      ? parsed.missingInformation.filter(Boolean).slice(0, 8)
      : fallback.missingInformation,
    warnings,
    extractedText: sourceText.slice(0, 8000),
    analysisSource: 'ai',
  };
}

export async function analyzeOpinionSource(params: {
  dto: OpinionAnalyzeDto;
  userId: string;
  organizationId: string;
  prisma: PrismaService;
  config: ConfigService;
  openai?: OpenAiService;
}): Promise<OpinionAnalyzeResult> {
  const url = (params.dto.sourceUrl ?? '').trim();
  const pasted = (params.dto.sourceText ?? '').trim();
  const transcript = (params.dto.transcript ?? '').trim();
  if (!url && !pasted && !transcript) {
    return emptyResult({
      message:
        'Thiếu nội dung nguồn. Cung cấp URL website/Facebook, dán nội dung hoặc transcript.',
      warnings: [],
    });
  }

  let resolved;
  try {
    resolved = await resolveSourceText(params);
  } catch (e) {
    if (e instanceof BadRequestException) throw e;
    if (e instanceof CrawlValidationError) {
      throw new BadRequestException(e.message);
    }
    throw e;
  }

  if (!resolved.text) {
    return emptyResult({
      warnings: ensureSingleSourceWarning(resolved.warnings, 0),
      sourceType: resolved.sourceType,
      insufficientData: true,
      message: resolved.message,
    });
  }

  let analysis: OpinionAnalyzeResult;
  if (params.openai?.isConfigured()) {
    try {
      analysis = await aiOpinionAnalyze(resolved.text, params.openai);
    } catch {
      analysis = templateOpinionAnalyze(resolved.text);
    }
  } else {
    analysis = templateOpinionAnalyze(resolved.text);
  }

  analysis.warnings = ensureSingleSourceWarning(
    [...resolved.warnings, ...analysis.warnings],
    resolved.sourceCount,
  );
  analysis.sourceType = resolved.sourceType;
  analysis.extractedText = resolved.text.slice(0, 8000);
  analysis.insufficientData = resolved.insufficientData;
  if (resolved.message) analysis.message = resolved.message;
  if (analysis.suggestedAngles.length < 3) {
    analysis.suggestedAngles = DEFAULT_ANGLES.slice(0, 5);
  }

  return analysis;
}

/** Exported for unit tests without network */
export const __test = {
  templateOpinionAnalyze,
  ensureSingleSourceWarning,
  SINGLE_SOURCE_WARNING,
  emptyResult,
};
