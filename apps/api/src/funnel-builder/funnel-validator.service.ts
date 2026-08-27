import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  buildFunnelValidatorExplanation,
  parseFunnelBlueprintDraft,
  parseFunnelCompleteSpec,
  validateFunnelBlueprintDraft,
  validateFunnelCompleteSpec,
  type FunnelValidatorResult,
} from '@marketingspa/shared';
import { OpenAiService } from '../openai/openai.service';

function isZodLikeError(err: unknown): err is { issues: Array<{ message: string }> } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'issues' in err &&
    Array.isArray((err as { issues: unknown }).issues)
  );
}

@Injectable()
export class FunnelValidatorService {
  private readonly logger = new Logger(FunnelValidatorService.name);

  constructor(private readonly openAi: OpenAiService) {}

  validateCompleteSpec(raw: unknown): FunnelValidatorResult {
    try {
      const spec = parseFunnelCompleteSpec(raw);
      return validateFunnelCompleteSpec(spec);
    } catch (err) {
      if (isZodLikeError(err)) {
        throw new BadRequestException({
          message: 'Complete spec không hợp lệ',
          issues: err.issues.map((i) => i.message),
        });
      }
      throw err;
    }
  }

  validateBlueprintDraft(raw: unknown): FunnelValidatorResult {
    try {
      const draft = parseFunnelBlueprintDraft(raw);
      return validateFunnelBlueprintDraft(draft);
    } catch (err) {
      if (isZodLikeError(err)) {
        throw new BadRequestException({
          message: 'Blueprint draft không hợp lệ',
          issues: err.issues.map((i) => i.message),
        });
      }
      throw err;
    }
  }

  async explain(result: FunnelValidatorResult): Promise<{ explanation: string; source: 'ai' | 'rules' }> {
    if (!this.openAi.isConfigured()) {
      return {
        explanation: buildFunnelValidatorExplanation(result),
        source: 'rules',
      };
    }

    try {
      const payload = {
        score: result.score,
        canActivate: result.canActivate,
        blocking: result.blocking,
        warnings: result.warnings,
        dimensions: Object.fromEntries(
          Object.entries(result.dimensions).map(([k, v]) => [
            k,
            { score: v.score, max: v.max, issues: v.issues },
          ]),
        ),
        failedChecks: result.checks.filter((c) => !c.passed).map((c) => ({
          id: c.id,
          label: c.label,
          message: c.message,
          hint: c.hint,
        })),
      };

      const text = await this.openAi.chatCompletion({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        maxTokens: 450,
        messages: [
          {
            role: 'system',
            content: `Bạn là chuyên gia funnel marketing spa. Giải thích điểm yếu funnel bằng tiếng Việt.
QUY TẮC BẮT BUỘC:
- CHỈ dựa trên JSON validation report được cung cấp
- KHÔNG bịa số KPI, conversion rate, ROAS, doanh thu, hoặc % dự đoán
- KHÔNG đưa ra con số hiệu suất thực tế vì chưa có dữ liệu ads
- Gợi ý sửa cụ thể theo từng check/dimension thiếu
- Tối đa 250 từ, bullet ngắn`,
          },
          {
            role: 'user',
            content: `Validation report:\n${JSON.stringify(payload, null, 2)}`,
          },
        ],
      });

      const explanation = text?.trim() || buildFunnelValidatorExplanation(result);
      return { explanation, source: 'ai' };
    } catch (err) {
      this.logger.warn(`AI funnel explanation failed: ${String(err)}`);
      return {
        explanation: buildFunnelValidatorExplanation(result),
        source: 'rules',
      };
    }
  }
}
