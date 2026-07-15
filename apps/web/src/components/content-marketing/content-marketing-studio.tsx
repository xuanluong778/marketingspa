'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Loader2,
  Maximize2,
  Save,
  Shield,
  Sparkles,
  Star,
  Wand2,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/page-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { PresetOrCustomField } from '@/components/content-marketing/preset-or-custom-field';
import { ContentPreviewDialog } from '@/components/content-marketing/content-preview-dialog';
import { SendToAutoPostButton } from '@/components/auto-post/send-to-auto-post-button';
import { ContentGeneratingLoader } from '@/components/content-marketing/content-generating-loader';
import { ContentHistoryModal } from '@/components/content-marketing/content-history-modal';
import { ContentHistoryTable } from '@/components/content-marketing/content-history-table';
import { useCurrentUser } from '@/hooks/use-auth';
import {
  useContentMarketingMutations,
  useContentMarketingStatus,
} from '@/hooks/use-content-marketing';
import {
  createHistoryId,
  defaultContentFormState,
  loadContentDraft,
  loadContentHistory,
  deleteContentHistoryItem,
  sampleAdFormState,
  saveContentDraft,
  saveContentHistoryItem,
} from '@/lib/content-marketing-form';
import { suggestAdCtaLocal, suggestAdInsightsLocal } from '@/lib/ad-insights-suggest';
import { PersonalPostStudio } from '@/components/content-marketing/personal-post-studio';
import { AdvancedPostStudio } from '@/components/content-marketing/advanced-post-studio';
import type {
  ContentFormState,
  ContentHistoryItem,
  ContentScoreResult,
  PolicyCheckResult,
  RewriteMode,
  VideoAnalysisResult,
} from '@/types/content-marketing';
import {
  AD_OBJECTIVE_OPTIONS,
  AD_TYPE_OPTIONS,
  OFFER_PERCENT_OPTIONS,
  PLATFORM_OPTIONS,
  PRODUCT_SERVICE_OPTIONS,
  TARGET_AUDIENCE_OPTIONS,
  TONE_OPTIONS,
} from '@/types/content-marketing';

function safeScore(n: number | undefined | null): number {
  if (n == null || !Number.isFinite(n) || Number.isNaN(n)) return 0;
  return Math.round(n);
}

function riskTone(level: string): string {
  if (level === 'high') return 'text-red-700 bg-red-50 border-red-200';
  if (level === 'medium') return 'text-amber-800 bg-amber-50 border-amber-200';
  return 'text-emerald-800 bg-emerald-50 border-emerald-200';
}

function readinessLabel(r: string): string {
  if (r === 'high') return 'Sẵn sàng chạy Ads';
  if (r === 'medium') return 'Cần tối ưu thêm';
  return 'Chưa sẵn sàng';
}

function KpiBar({
  contentScore,
  policy,
  variantCount,
  adsReadiness,
}: {
  contentScore: number;
  policy: PolicyCheckResult | null;
  variantCount: number;
  adsReadiness: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[
        { label: 'Điểm content', value: `${safeScore(contentScore)}/100`, icon: Star },
        {
          label: 'Điểm chính sách',
          value: policy ? `${safeScore(policy.safetyScore)}/100` : '—',
          icon: Shield,
        },
        { label: 'Số phiên bản', value: String(variantCount), icon: Wand2 },
        { label: 'Sẵn sàng Ads', value: readinessLabel(adsReadiness), icon: CheckCircle2 },
      ].map(({ label, value, icon: Icon }) => (
        <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-medium uppercase text-slate-500">
            <Icon className="h-3.5 w-3.5" />
            {label}
          </div>
          <p className="mt-1 text-lg font-bold text-slate-900">{value}</p>
        </div>
      ))}
    </div>
  );
}

function ScoreBreakdown({ score }: { score: ContentScoreResult }) {
  const labels: Record<string, string> = {
    hook: 'Hook',
    insight: 'Insight',
    benefits: 'Lợi ích',
    proof: 'Bằng chứng',
    cta: 'CTA',
    readability: 'Dễ đọc',
    platformFit: 'Nền tảng',
    policySafety: 'Chính sách',
  };
  return (
    <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
      {Object.entries(score.criteria).map(([k, v]) => (
        <div key={k} className="rounded-lg bg-slate-50 px-2 py-1.5">
          <span className="text-slate-500">{labels[k] ?? k}</span>
          <p className="font-semibold tabular-nums">{safeScore(v)}/12.5</p>
        </div>
      ))}
    </div>
  );
}

function ContentForm({
  form,
  onChange,
  onSuggestInsights,
  suggestingInsights,
  suggestMsg,
  onSuggestCta,
  suggestingCta,
  ctaSuggestMsg,
  ctaAlternatives,
}: {
  form: ContentFormState;
  onChange: (patch: Partial<ContentFormState>) => void;
  onSuggestInsights?: () => void;
  suggestingInsights?: boolean;
  suggestMsg?: string;
  onSuggestCta?: () => void;
  suggestingCta?: boolean;
  ctaSuggestMsg?: string;
  ctaAlternatives?: string[];
}) {
  return (
    <div className="space-y-4">
      <PresetOrCustomField
        label="Sản phẩm / dịch vụ"
        required
        value={form.productService}
        options={PRODUCT_SERVICE_OPTIONS}
        placeholder="VD: Liệu trình trẻ hóa da spa"
        onChange={(v) => onChange({ productService: v })}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <PresetOrCustomField
          label="Khách hàng mục tiêu"
          value={form.targetAudience}
          options={TARGET_AUDIENCE_OPTIONS}
          placeholder="VD: Nữ 28–45, văn phòng"
          onChange={(v) => onChange({ targetAudience: v })}
        />
        <div className="space-y-1.5">
          <Label>Nền tảng</Label>
          <Select
            value={form.platform}
            onValueChange={(v) => onChange({ platform: v as ContentFormState['platform'] })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLATFORM_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!form.productService.trim() || suggestingInsights}
            onClick={onSuggestInsights}
          >
            {suggestingInsights ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            )}
            Gợi ý AI
          </Button>
          {suggestMsg ? <span className="text-xs text-emerald-700">{suggestMsg}</span> : null}
        </div>
        <div className="space-y-1.5">
          <Label>Nỗi đau khách hàng</Label>
          <Textarea
            value={form.painPoints}
            placeholder="VD: Da xỉn, lỗ chân lông to..."
            rows={2}
            className="bg-white"
            onChange={(e) => onChange({ painPoints: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Lợi ích / giải pháp</Label>
          <Textarea
            value={form.benefits}
            placeholder="VD: Da sáng hơn, thư giãn..."
            rows={2}
            className="bg-white"
            onChange={(e) => onChange({ benefits: e.target.value })}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Mục tiêu quảng cáo</Label>
        <Select
          value={form.adObjective || undefined}
          onValueChange={(v) => {
            const opt = AD_OBJECTIVE_OPTIONS.find((o) => o.value === v);
            onChange({
              adObjective: v as ContentFormState['adObjective'],
              adContentType: opt?.defaultContentType ?? form.adContentType,
              ...(opt && !form.cta.trim() ? { cta: opt.defaultCta } : {}),
            });
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Chọn mục tiêu quảng cáo" />
          </SelectTrigger>
          <SelectContent>
            {AD_OBJECTIVE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                <span className="font-medium">{o.label}</span>
                <span className="ml-2 text-xs text-muted-foreground">— {o.description}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {form.adObjective ? (
          <p className="text-xs text-slate-500">
            {AD_OBJECTIVE_OPTIONS.find((o) => o.value === form.adObjective)?.description}
          </p>
        ) : (
          <p className="text-xs text-amber-700">Chọn mục tiêu để AI gợi ý content, CTA và chấm điểm phù hợp</p>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <PresetOrCustomField
          label="Ưu đãi"
          value={form.offer}
          options={OFFER_PERCENT_OPTIONS}
          placeholder="VD: Giảm 30% tháng này, tặng kèm serum"
          onChange={(v) => onChange({ offer: v })}
        />
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>CTA</Label>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-7 text-xs"
              disabled={!form.productService.trim() || suggestingCta}
              onClick={onSuggestCta}
            >
              {suggestingCta ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="mr-1 h-3 w-3" />
              )}
              Gợi ý AI
            </Button>
          </div>
          {ctaSuggestMsg ? (
            <p className="text-xs text-emerald-700">{ctaSuggestMsg}</p>
          ) : null}
          <Input
            value={form.cta}
            placeholder='VD: Inbox "SPA" để tư vấn'
            onChange={(e) => onChange({ cta: e.target.value })}
          />
          {ctaAlternatives && ctaAlternatives.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {ctaAlternatives.map((alt) => (
                <button
                  key={alt}
                  type="button"
                  className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700 hover:bg-violet-50 hover:border-violet-200"
                  onClick={() => onChange({ cta: alt })}
                >
                  {alt.length > 42 ? `${alt.slice(0, 42)}…` : alt}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Văn phong</Label>
          <Select
            value={form.tone}
            onValueChange={(v) => onChange({ tone: v as ContentFormState['tone'] })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TONE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Loại content QC</Label>
          <Select
            value={form.adContentType}
            onValueChange={(v) =>
              onChange({ adContentType: v as ContentFormState['adContentType'] })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AD_TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="rounded-lg border border-dashed border-violet-200 bg-violet-50/50 p-4 space-y-3">
        <p className="text-sm font-medium text-violet-900">Phân tích video / transcript</p>
        <div className="space-y-1.5">
          <Label className="text-xs">Link Facebook / TikTok</Label>
          <Input
            value={form.videoUrl}
            placeholder="https://..."
            onChange={(e) => onChange({ videoUrl: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Hoặc dán transcript / caption</Label>
          <Textarea
            value={form.transcript}
            placeholder="Dán nội dung video nếu không lấy được từ link..."
            rows={3}
            onChange={(e) => onChange({ transcript: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}

export function AdStudioTabPanel({
  historyEditItem,
  onHistoryEditApplied,
  onHistoryChange,
}: {
  historyEditItem?: ContentHistoryItem | null;
  onHistoryEditApplied?: () => void;
  onHistoryChange?: () => void;
}) {
  const { data: user } = useCurrentUser();
  const userId = user?.id;
  const { data: aiStatus, isLoading: aiStatusLoading, isError: aiStatusError } =
    useContentMarketingStatus();
  const { generate, analyzeVideo, checkPolicy, score, rewrite, suggestInsights, suggestCta } =
    useContentMarketingMutations();

  const [form, setForm] = useState<ContentFormState>(defaultContentFormState);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [content, setContent] = useState('');
  const [policy, setPolicy] = useState<PolicyCheckResult | null>(null);
  const [scoreResult, setScoreResult] = useState<ContentScoreResult | null>(null);
  const [videoAnalysis, setVideoAnalysis] = useState<VideoAnalysisResult | null>(null);
  const [variants, setVariants] = useState<string[]>([]);
  const [hooks, setHooks] = useState<string[]>([]);
  const [ctas, setCtas] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [copyMsg, setCopyMsg] = useState('');
  const [contentPreviewOpen, setContentPreviewOpen] = useState(false);
  const [lastGeneratedAt, setLastGeneratedAt] = useState<string | undefined>();
  const [suggestMsg, setSuggestMsg] = useState('');
  const [ctaSuggestMsg, setCtaSuggestMsg] = useState('');
  const [ctaAlternatives, setCtaAlternatives] = useState<string[]>([]);

  useEffect(() => {
    const draft = loadContentDraft(userId, 'ad');
    setForm(draft ?? defaultContentFormState);
    setDraftLoaded(true);
  }, [userId]);

  useEffect(() => {
    if (!historyEditItem || historyEditItem.tab !== 'ad') return;
    setContent(historyEditItem.content);
    setForm((prev) => ({
      ...prev,
      productService: historyEditItem.title?.trim() || prev.productService,
    }));
    setScoreResult(null);
    setPolicy(null);
    setVariants([]);
    setHooks([]);
    setCtas([]);
    onHistoryEditApplied?.();
  }, [historyEditItem, onHistoryEditApplied]);

  const updateForm = useCallback((patch: Partial<ContentFormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const isBusy =
    generate.isPending ||
    analyzeVideo.isPending ||
    checkPolicy.isPending ||
    score.isPending ||
    rewrite.isPending ||
    suggestInsights.isPending ||
    suggestCta.isPending;

  const handleSuggestCta = useCallback(async () => {
    if (!form.productService.trim()) return;
    setCtaSuggestMsg('');
    const payload = {
      productService: form.productService,
      targetAudience: form.targetAudience || undefined,
      platform: form.platform,
      offer: form.offer || undefined,
      adObjective: form.adObjective || undefined,
      adContentType: form.adContentType,
    };
    try {
      const result = await suggestCta.mutateAsync(payload);
      updateForm({ cta: result.cta });
      setCtaAlternatives(result.alternatives ?? []);
      setCtaSuggestMsg(result.source === 'ai' ? 'Đã gợi ý CTA bằng AI' : 'Đã gợi ý CTA (template)');
    } catch {
      const local = suggestAdCtaLocal(payload);
      updateForm({ cta: local.cta });
      setCtaAlternatives(local.alternatives);
      setCtaSuggestMsg('Đã gợi ý CTA (offline)');
    }
    setTimeout(() => setCtaSuggestMsg(''), 3000);
  }, [form, suggestCta, updateForm]);

  const handleSuggestInsights = useCallback(async () => {
    if (!form.productService.trim()) return;
    setSuggestMsg('');
    const payload = {
      productService: form.productService,
      targetAudience: form.targetAudience || undefined,
      platform: form.platform,
      adObjective: form.adObjective || undefined,
    };
    try {
      const result = await suggestInsights.mutateAsync(payload);
      updateForm({ painPoints: result.painPoints, benefits: result.benefits });
      setSuggestMsg(result.source === 'ai' ? 'Đã gợi ý bằng AI' : 'Đã gợi ý (template)');
    } catch {
      const local = suggestAdInsightsLocal(payload);
      updateForm({ painPoints: local.painPoints, benefits: local.benefits });
      setSuggestMsg('Đã gợi ý (offline — restart API để dùng AI đầy đủ)');
    }
    setTimeout(() => setSuggestMsg(''), 3000);
  }, [form.productService, form.targetAudience, form.platform, form.adObjective, suggestInsights, updateForm]);

  const handleGenerate = useCallback(async () => {
    if (!form.productService.trim()) return;
    setContent('');
    setPolicy(null);
    setScoreResult(null);
    setHooks([]);
    setCtas([]);
    setVariants([]);
    setVideoAnalysis(null);
    const result = await generate.mutateAsync({ form, mode: 'ad' });
    setLastGeneratedAt(new Date().toISOString());
    setContent(result.content);
    setPolicy(result.policy);
    setScoreResult(result.score);
    setHooks(result.hooks ?? []);
    setCtas(result.ctas ?? []);
    setVariants([]);
    if (form.videoUrl.trim() || form.transcript.trim()) {
      const analysis = await analyzeVideo.mutateAsync({
        videoUrl: form.videoUrl || undefined,
        transcript: form.transcript || undefined,
      });
      setVideoAnalysis(analysis);
    }
  }, [form, generate, analyzeVideo]);

  const handleCheckPolicy = useCallback(async () => {
    if (!content.trim()) return;
    const result = await checkPolicy.mutateAsync({ content, platform: form.platform });
    setPolicy(result);
  }, [content, form.platform, checkPolicy]);

  const handleScore = useCallback(async () => {
    if (!content.trim()) return;
    const result = await score.mutateAsync({
      content,
      platform: form.platform,
      mode: 'ad',
      adObjective: form.adObjective || undefined,
    });
    setPolicy(result.policy);
    setScoreResult({
      total: result.total,
      criteria: result.criteria,
      strengths: result.strengths,
      improvements: result.improvements,
      adsReadiness: result.adsReadiness,
    });
  }, [content, form.platform, form.adObjective, score]);

  const handleRewrite = useCallback(
    async (mode: RewriteMode) => {
      if (!content.trim()) return;
      const result = await rewrite.mutateAsync({
        content,
        mode,
        platform: form.platform,
        tone: form.tone,
      });
      setVariants(result.variants ?? []);
    },
    [content, form.platform, form.tone, rewrite],
  );

  const handleSave = useCallback(() => {
    saveContentDraft(form, userId, 'ad');
    if (content.trim()) {
      saveContentHistoryItem(
        {
          id: createHistoryId(),
          tab: 'ad',
          title: form.productService.slice(0, 60) || 'Content',
          content,
          contentScore: safeScore(scoreResult?.total),
          policyScore: safeScore(policy?.safetyScore),
          variantCount: variants.length,
          adsReadiness: scoreResult?.adsReadiness ?? 'low',
          createdAt: new Date().toISOString(),
        },
        userId,
      );
      onHistoryChange?.();
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [form, userId, content, scoreResult, policy, variants, onHistoryChange]);

  const handleSample = useCallback(() => {
    setForm(sampleAdFormState);
  }, []);

  const handleCopy = useCallback(async () => {
    if (!content) return;
    await navigator.clipboard.writeText(content);
    setCopyMsg('Đã copy!');
    setTimeout(() => setCopyMsg(''), 2000);
  }, [content]);

  const errorMsg =
    generate.error?.message ||
    analyzeVideo.error?.message ||
    checkPolicy.error?.message ||
    score.error?.message ||
    rewrite.error?.message ||
    suggestInsights.error?.message ||
    suggestCta.error?.message;

  const hasResult = !!content.trim();

  if (!draftLoaded) return <LoadingState message="Đang tải nháp..." />;

  return (
    <div className="space-y-6">
      {aiStatus?.aiConfigured && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          AI đã sẵn sàng — model <strong>{aiStatus.model}</strong>
        </div>
      )}

      {!aiStatusLoading && !aiStatusError && aiStatus && !aiStatus.aiConfigured && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          OPENAI_API_KEY chưa được API đọc — thêm vào <code>.env</code> ở thư mục gốc project rồi{' '}
          <strong>restart server API</strong> (port 4000).
        </div>
      )}

      {hasResult && scoreResult && !generate.isPending && (
        <KpiBar
          contentScore={scoreResult.total}
          policy={policy}
          variantCount={variants.length}
          adsReadiness={scoreResult.adsReadiness}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b bg-slate-50 px-4 py-3">
            <h3 className="font-semibold text-slate-900">Form nội dung quảng cáo</h3>
          </div>
          <div className="p-4">
            <ContentForm
              form={form}
              onChange={updateForm}
              onSuggestInsights={handleSuggestInsights}
              suggestingInsights={suggestInsights.isPending}
              suggestMsg={suggestMsg}
              onSuggestCta={handleSuggestCta}
              suggestingCta={suggestCta.isPending}
              ctaSuggestMsg={ctaSuggestMsg}
              ctaAlternatives={ctaAlternatives}
            />
          </div>
          <div className="flex flex-wrap gap-2 border-t bg-slate-50 p-4">
            <Button onClick={handleGenerate} disabled={isBusy || !form.productService.trim()}>
              {generate.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Tạo content
            </Button>
            <Button
              variant="outline"
              className="border-[#0A3D30] bg-[#0A3D30] text-white hover:bg-[#083028] hover:text-white [&_svg]:text-white"
              onClick={handleSample}
            >
              Dùng mẫu
            </Button>
            <Button
              variant="outline"
              className="border-[#0A3D30] bg-[#0A3D30] text-white hover:bg-[#083028] hover:text-white [&_svg]:text-white"
              onClick={handleSave}
            >
              <Save className="mr-2 h-4 w-4" />
              {saved ? 'Đã lưu!' : 'Lưu'}
            </Button>
          </div>
        </div>

        <div className="space-y-4 min-h-[320px]">
          {generate.isPending && (
            <ContentGeneratingLoader
              title="Đang viết bài"
              subtitle="AI đang viết content quảng cáo — vui lòng đợi trong giây lát"
            />
          )}

          {!hasResult && !generate.isPending && (
            <EmptyState
              className="text-white [&_svg]:text-white"
              title="Chưa có content"
              description="Nhập form bên trái và bấm Tạo content để xem kết quả, điểm số và cảnh báo chính sách."
            />
          )}

          {hasResult && !generate.isPending && (
            <>
              <div className="content-result-box rounded-xl border border-slate-200 bg-white text-slate-900 shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                  <h3 className="font-semibold text-slate-900">Kết quả content</h3>
                  <div className="flex items-center gap-1 text-slate-800">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-slate-800 hover:text-slate-900"
                      onClick={() => setContentPreviewOpen(true)}
                      disabled={!content.trim()}
                    >
                      <Maximize2 className="mr-1 h-4 w-4" />
                      Xem lớn
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-slate-800 hover:text-slate-900"
                      onClick={handleCopy}
                    >
                      <Copy className="mr-1 h-4 w-4" />
                      {copyMsg || 'Copy'}
                    </Button>
                    <SendToAutoPostButton
                      tab="ad"
                      title={form.productService}
                      content={content}
                      contentScore={scoreResult?.total}
                      variant="ghost"
                    />
                  </div>
                </div>
                <Textarea
                  className="min-h-[220px] rounded-none border-0 bg-white text-slate-900 placeholder:text-slate-400 focus-visible:ring-0"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
                <div className="flex flex-wrap gap-2 border-t p-3">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-[#0A3D30] bg-[#0A3D30] text-white hover:border-[#0A3D30] hover:bg-[#0A3D30] hover:text-[#F97316] [&_svg]:text-white hover:[&_svg]:text-[#F97316]"
                    onClick={handleCheckPolicy}
                    disabled={isBusy}
                  >
                    <Shield className="mr-1 h-3.5 w-3.5" />
                    Kiểm tra chính sách
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-[#0A3D30] bg-[#0A3D30] text-white hover:border-[#0A3D30] hover:bg-[#0A3D30] hover:text-[#F97316] [&_svg]:text-white hover:[&_svg]:text-[#F97316]"
                    onClick={handleScore}
                    disabled={isBusy}
                  >
                    <Star className="mr-1 h-3.5 w-3.5" />
                    Chấm điểm
                  </Button>
                  {(
                    [
                      ['stronger', 'Mạnh hơn'],
                      ['safer', 'An toàn hơn'],
                      ['shorter', 'Ngắn hơn'],
                      ['longer', 'Dài hơn'],
                      ['funnier', 'Hài hước hơn'],
                      ['hooks_5', '5 hook'],
                      ['cta_5', '5 CTA'],
                      ['ab_3', 'A/B x3'],
                    ] as const
                  ).map(([mode, label]) => (
                    <Button
                      key={mode}
                      size="sm"
                      variant="secondary"
                      className="border-[#0A3D30] bg-[#0A3D30] text-white hover:border-[#0A3D30] hover:bg-[#0A3D30] hover:text-[#F97316]"
                      disabled={isBusy}
                      onClick={() => handleRewrite(mode)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              {policy && (
                <div className={cn('rounded-xl border p-4', riskTone(policy.riskLevel))}>
                  <div className="flex items-center gap-2 font-semibold">
                    <Shield className="h-4 w-4" />
                    Chính sách Facebook — {safeScore(policy.safetyScore)}/100 (
                    {policy.riskLevel === 'low'
                      ? 'Thấp'
                      : policy.riskLevel === 'medium'
                        ? 'Trung bình'
                        : 'Cao'}
                    )
                  </div>
                  <p className="mt-1 text-xs opacity-80">{policy.disclaimer}</p>
                  {policy.flaggedPhrases.length > 0 && (
                    <ul className="mt-2 space-y-1 text-sm">
                      {policy.flaggedPhrases.map((f, i) => (
                        <li key={i}>
                          <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                          <strong>{f.phrase}</strong> — {f.reason}. Gợi ý: {f.suggestion}
                        </li>
                      ))}
                    </ul>
                  )}
                  {policy.saferVersion?.trim() && (
                    <div className="mt-3 rounded-lg border border-white/60 bg-white/50 p-3 text-sm">
                      <p className="font-medium">Phiên bản an toàn hơn</p>
                      <p className="mt-1 whitespace-pre-wrap">{policy.saferVersion}</p>
                    </div>
                  )}
                </div>
              )}

              {scoreResult && (
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="font-semibold">Điểm content: {safeScore(scoreResult.total)}/100</p>
                  <ScoreBreakdown score={scoreResult} />
                  {scoreResult.strengths?.length > 0 && (
                    <p className="mt-2 text-sm text-emerald-700">
                      Điểm mạnh: {scoreResult.strengths.join(' · ')}
                    </p>
                  )}
                  {scoreResult.improvements?.length > 0 && (
                    <p className="mt-1 text-sm text-amber-800">
                      Cần cải thiện: {scoreResult.improvements.join(' · ')}
                    </p>
                  )}
                </div>
              )}

              {videoAnalysis && videoAnalysis.topic && (
                <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4 text-sm">
                  <p className="font-semibold text-violet-900">Phân tích video</p>
                  <p className="mt-1">Chủ đề: {videoAnalysis.topic}</p>
                  {videoAnalysis.insights?.length > 0 && (
                    <p>Insight: {videoAnalysis.insights.join(' · ')}</p>
                  )}
                  <p>Hook: {videoAnalysis.hook}</p>
                  <p>Góc nhìn: {videoAnalysis.angle}</p>
                  {videoAnalysis.contentIdeas?.length > 0 && (
                    <p>Ý tưởng content: {videoAnalysis.contentIdeas.join(' · ')}</p>
                  )}
                  <p className="mt-1">CTA gợi ý: {videoAnalysis.suggestedCta}</p>
                </div>
              )}

              {variants.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-2">
                  <p className="font-semibold">Phiên bản viết lại</p>
                  {variants.map((v, i) => (
                    <div key={i} className="rounded-lg bg-slate-50 p-3 text-sm whitespace-pre-wrap">
                      {v}
                    </div>
                  ))}
                </div>
              )}

              {(hooks.length > 0 || ctas.length > 0) && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {hooks.length > 0 && (
                    <div className="rounded-xl border border-white/25 bg-[#0A3D30] p-3 text-sm text-white">
                      <p className="mb-1 font-semibold text-white">Hook gợi ý</p>
                      <ul className="list-disc space-y-1 pl-4 text-white">
                        {hooks.map((h, i) => (
                          <li key={i} className="text-white">
                            {h}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {ctas.length > 0 && (
                    <div className="rounded-xl border border-white/25 bg-[#0A3D30] p-3 text-sm text-white">
                      <p className="mb-1 font-semibold text-white">CTA gợi ý</p>
                      <ul className="list-disc space-y-1 pl-4 text-white">
                        {ctas.map((c, i) => (
                          <li key={i} className="text-white">
                            {c}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {errorMsg && <ErrorState message={errorMsg} onRetry={() => generate.reset()} />}

      <ContentPreviewDialog
        open={contentPreviewOpen}
        onOpenChange={setContentPreviewOpen}
        title={form.productService}
        category="Quảng Cáo Bán Hàng"
        score={scoreResult?.total}
        createdAt={lastGeneratedAt}
        content={content}
        onContentChange={setContent}
      />
    </div>
  );
}

export function ContentMarketingStudio() {
  const { data: user } = useCurrentUser();
  const [activeTab, setActiveTab] = useState<'ad' | 'personal' | 'advanced'>('ad');
  const [historyVersion, setHistoryVersion] = useState(0);
  const [historyModalItem, setHistoryModalItem] = useState<ContentHistoryItem | null>(null);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyEditItem, setHistoryEditItem] = useState<ContentHistoryItem | null>(null);
  const [historyTabFilter, setHistoryTabFilter] = useState<'ad' | 'personal' | 'advanced'>('ad');

  const [history, setHistory] = useState<ContentHistoryItem[]>([]);

  useEffect(() => {
    setHistory(loadContentHistory(user?.id));
  }, [user?.id, historyVersion]);

  const filteredHistory = useMemo(
    () => history.filter((item) => item.tab === historyTabFilter),
    [history, historyTabFilter],
  );

  const handleHistoryChange = useCallback(() => {
    setHistoryVersion((v) => v + 1);
  }, []);

  const handleOpenHistory = useCallback((item: ContentHistoryItem) => {
    setHistoryModalItem(item);
    setHistoryModalOpen(true);
  }, []);

  const handleEditHistory = useCallback((item: ContentHistoryItem) => {
    setActiveTab(item.tab);
    setHistoryEditItem(item);
    setHistoryModalOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleHistoryEditApplied = useCallback(() => {
    setHistoryEditItem(null);
  }, []);

  const handleDeleteHistory = useCallback(
    (item: ContentHistoryItem) => {
      const title = item.title?.trim() || 'bài viết này';
      if (!window.confirm(`Xóa "${title}" khỏi lịch sử?`)) return;
      deleteContentHistoryItem(item.id, user?.id);
      if (historyModalItem?.id === item.id) {
        setHistoryModalOpen(false);
        setHistoryModalItem(null);
      }
      handleHistoryChange();
    },
    [user?.id, historyModalItem, handleHistoryChange],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Content Marketing Studio"
        description="AI Marketing — tạo nội dung quảng cáo & đăng bài cá nhân chuyên nghiệp"
      />

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'ad' | 'personal' | 'advanced')}
        className="space-y-6"
      >
        <TabsList className="grid w-full max-w-2xl grid-cols-3">
          <TabsTrigger value="ad">Quảng Cáo Bán Hàng</TabsTrigger>
          <TabsTrigger value="personal">Xây Dựng Thương Hiệu</TabsTrigger>
          <TabsTrigger value="advanced">Viết bài nâng cao</TabsTrigger>
        </TabsList>
        <TabsContent value="ad" className="mt-0">
          <AdStudioTabPanel
            historyEditItem={historyEditItem}
            onHistoryEditApplied={handleHistoryEditApplied}
            onHistoryChange={handleHistoryChange}
          />
        </TabsContent>
        <TabsContent value="personal" className="mt-0">
          <PersonalPostStudio
            historyEditItem={historyEditItem}
            onHistoryEditApplied={handleHistoryEditApplied}
            onHistoryChange={handleHistoryChange}
          />
        </TabsContent>
        <TabsContent value="advanced" className="mt-0">
          <AdvancedPostStudio
            historyEditItem={historyEditItem}
            onHistoryEditApplied={handleHistoryEditApplied}
            onHistoryChange={handleHistoryChange}
          />
        </TabsContent>
      </Tabs>

      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            Bài Viết Đã Lưu
            {filteredHistory.length > 0 ? (
              <span className="ml-2 text-sm font-normal text-slate-500">
                ({filteredHistory.length})
              </span>
            ) : null}
          </h2>
          <div className="w-full sm:w-64">
            <Select
              value={historyTabFilter}
              onValueChange={(v) => setHistoryTabFilter(v as 'ad' | 'personal' | 'advanced')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ad">Quảng Cáo Bán Hàng</SelectItem>
                <SelectItem value="personal">Xây Dựng Thương Hiệu</SelectItem>
                <SelectItem value="advanced">Viết bài nâng cao</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <ContentHistoryTable
          items={filteredHistory}
          onOpen={handleOpenHistory}
          onEdit={handleEditHistory}
          onDelete={handleDeleteHistory}
          emptyMessage={
            historyTabFilter === 'ad'
              ? 'Chưa có bài quảng cáo bán hàng đã lưu'
              : 'Chưa có bài xây dựng thương hiệu đã lưu'
          }
        />
      </section>

      <ContentHistoryModal
        item={historyModalItem}
        open={historyModalOpen}
        onOpenChange={setHistoryModalOpen}
        onEdit={handleEditHistory}
      />
    </div>
  );
}
