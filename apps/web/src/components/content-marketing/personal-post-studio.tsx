'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Heart,
  Loader2,
  Maximize2,
  MessageCircle,
  Save,
  Sparkles,
  Star,
  Wand2,
} from 'lucide-react';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/page-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCurrentUser } from '@/hooks/use-auth';
import {
  useContentMarketingMutations,
  useContentMarketingStatus,
} from '@/hooks/use-content-marketing';
import {
  createHistoryId,
  defaultPersonalFormState,
  loadPersonalDraft,
  samplePersonalFormState,
  saveContentHistoryItem,
  savePersonalDraft,
} from '@/lib/content-marketing-form';
import { suggestPersonalIdeasLocal } from '@/lib/personal-ideas-suggest';
import { formatMutationError } from '@/lib/format-mutation-error';
import { PresetOrCustomField } from '@/components/content-marketing/preset-or-custom-field';
import { ContentPreviewDialog } from '@/components/content-marketing/content-preview-dialog';
import { SendToAutoPostButton } from '@/components/auto-post/send-to-auto-post-button';
import { ContentGeneratingLoader } from '@/components/content-marketing/content-generating-loader';
import type {
  ContentHistoryItem,
  PersonalFormState,
  PersonalRewriteMode,
  PersonalScoreResult,
  VideoAnalysisResult,
} from '@/types/content-marketing';
import {
  PERSONAL_GOAL_OPTIONS,
  PERSONAL_POST_TOPIC_OPTIONS,
  PERSONAL_READER_AUDIENCE_OPTIONS,
  PERSONAL_TONE_OPTIONS,
  BRAND_ARTICLE_GENRE_OPTIONS,
  BRAND_PRONOUN_OPTIONS,
  BRAND_VOICE_INTENSITY_OPTIONS,
  POST_LENGTH_OPTIONS,
  MAY_TAO_INSPIRATION_CTAS,
  SOFT_INTERACTION_CTAS,
} from '@/types/content-marketing';

function safeScore(n: number | undefined | null): number {
  if (n == null || !Number.isFinite(n) || Number.isNaN(n)) return 0;
  return Math.round(n);
}

function interactionLabel(r: string): string {
  if (r === 'high') return 'Khả năng tương tác cao';
  if (r === 'medium') return 'Cần tối ưu thêm';
  return 'Chưa sẵn sàng đăng';
}

function PersonalKpiBar({
  score,
  variantCount,
}: {
  score: PersonalScoreResult | null;
  variantCount: number;
}) {
  if (!score) return null;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[
        { label: 'Điểm tương tác', value: `${safeScore(score.total)}/100`, icon: MessageCircle },
        {
          label: 'Điểm cảm xúc',
          value: `${safeScore(score.criteria.emotion)}/20`,
          icon: Heart,
        },
        {
          label: 'Độ tự nhiên',
          value: `${safeScore(score.criteria.naturalness)}/15`,
          icon: CheckCircle2,
        },
        {
          label: 'Mức sẵn sàng',
          value: interactionLabel(score.interactionReadiness),
          icon: Star,
        },
      ].map(({ label, value, icon: Icon }) => (
        <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-medium uppercase text-slate-500">
            <Icon className="h-3.5 w-3.5" />
            {label}
          </div>
          <p className="mt-1 text-lg font-bold text-slate-900">{value}</p>
        </div>
      ))}
      <div className="col-span-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-4">
        <div className="flex items-center gap-2 text-xs font-medium uppercase text-slate-500">
          <Wand2 className="h-3.5 w-3.5" />
          Số phiên bản viết lại
        </div>
        <p className="mt-1 text-lg font-bold text-slate-900">{variantCount}</p>
      </div>
    </div>
  );
}

function PersonalScoreBreakdown({ score }: { score: PersonalScoreResult }) {
  const labels: Record<string, string> = {
    hook: 'Hook mở đầu',
    emotion: 'Cảm xúc',
    relatability: 'Gần gũi',
    personalAngle: 'Góc nhìn cá nhân',
    engagement: 'Tương tác',
    naturalness: 'Tự nhiên',
  };
  const maxScores: Record<string, number> = {
    hook: 20,
    emotion: 20,
    relatability: 15,
    personalAngle: 15,
    engagement: 15,
    naturalness: 15,
  };
  return (
    <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
      {Object.entries(score.criteria).map(([k, v]) => (
        <div key={k} className="rounded-lg bg-slate-50 px-2 py-1.5">
          <span className="text-slate-500">{labels[k] ?? k}</span>
          <p className="font-semibold tabular-nums">
            {safeScore(v)}/{maxScores[k] ?? 15}
          </p>
        </div>
      ))}
    </div>
  );
}

function PersonalForm({
  form,
  onChange,
  onSuggestIdeas,
  suggestingIdeas,
  suggestMsg,
  angleAlternatives,
  storyAlternatives,
}: {
  form: PersonalFormState;
  onChange: (patch: Partial<PersonalFormState>) => void;
  onSuggestIdeas?: () => void;
  suggestingIdeas?: boolean;
  suggestMsg?: string;
  angleAlternatives?: string[];
  storyAlternatives?: string[];
}) {
  return (
    <div className="space-y-4">
      <PresetOrCustomField
        label="Chủ đề bài viết"
        required
        value={form.postTopic}
        options={PERSONAL_POST_TOPIC_OPTIONS}
        placeholder="VD: Bài học về sự kiên nhẫn trong công việc"
        onChange={(v) => onChange({ postTopic: v })}
      />
      <PresetOrCustomField
        label="Đối tượng người đọc"
        value={form.targetAudience}
        options={PERSONAL_READER_AUDIENCE_OPTIONS}
        placeholder="VD: Người trẻ làm văn phòng, đang tìm định hướng"
        onChange={(v) => onChange({ targetAudience: v })}
      />
      <div className="space-y-1.5">
        <Label>Mục tiêu bài viết</Label>
        <Select
          value={form.postGoal}
          onValueChange={(v) => onChange({ postGoal: v as PersonalFormState['postGoal'] })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERSONAL_GOAL_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Thể loại bài viết</Label>
          <Select
            value={form.brandArticleGenre}
            onValueChange={(v) =>
              onChange({ brandArticleGenre: v as PersonalFormState['brandArticleGenre'] })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BRAND_ARTICLE_GENRE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Xưng hô</Label>
          <Select
            value={form.brandPronoun}
            onValueChange={(v) =>
              onChange({ brandPronoun: v as PersonalFormState['brandPronoun'] })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BRAND_PRONOUN_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Độ mạnh văn phong</Label>
          <Select
            value={form.brandVoiceIntensity}
            onValueChange={(v) =>
              onChange({ brandVoiceIntensity: v as PersonalFormState['brandVoiceIntensity'] })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BRAND_VOICE_INTENSITY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {BRAND_VOICE_INTENSITY_OPTIONS.find((o) => o.value === form.brandVoiceIntensity)
            ?.description ? (
            <p className="text-xs text-slate-500">
              {
                BRAND_VOICE_INTENSITY_OPTIONS.find((o) => o.value === form.brandVoiceIntensity)
                  ?.description
              }
            </p>
          ) : null}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Văn phong bổ sung (tuỳ chọn)</Label>
          <Select
            value={form.personalTone}
            onValueChange={(v) => onChange({ personalTone: v as PersonalFormState['personalTone'] })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERSONAL_TONE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {PERSONAL_TONE_OPTIONS.find((o) => o.value === form.personalTone)?.description ? (
            <p className="text-xs text-slate-500">
              {PERSONAL_TONE_OPTIONS.find((o) => o.value === form.personalTone)?.description}
            </p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label>Độ dài bài viết</Label>
          <Select
            value={form.postLength}
            onValueChange={(v) => onChange({ postLength: v as PersonalFormState['postLength'] })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {POST_LENGTH_OPTIONS.map((o) => (
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
            disabled={!form.postTopic.trim() || suggestingIdeas}
            onClick={onSuggestIdeas}
          >
            {suggestingIdeas ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            )}
            Gợi ý AI
          </Button>
          {suggestMsg ? <span className="text-xs text-emerald-700">{suggestMsg}</span> : null}
        </div>
        <div className="space-y-1.5">
          <Label>Góc nhìn muốn khai thác</Label>
          <Textarea
            value={form.personalAngle}
            placeholder="VD: Thành công không phải lúc nào cũng ồn ào"
            rows={2}
            className="bg-white"
            onChange={(e) => onChange({ personalAngle: e.target.value })}
          />
          {angleAlternatives && angleAlternatives.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {angleAlternatives.map((alt) => (
                <button
                  key={alt}
                  type="button"
                  className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700 hover:bg-violet-50 hover:border-violet-200"
                  onClick={() => onChange({ personalAngle: alt })}
                >
                  {alt.length > 48 ? `${alt.slice(0, 48)}…` : alt}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Câu chuyện hoặc ý tưởng thô</Label>
          <Textarea
            value={form.storyIdea}
            placeholder="VD: Kể về lần thất bại đầu tiên khi khởi nghiệp..."
            rows={3}
            className="bg-white"
            onChange={(e) => onChange({ storyIdea: e.target.value })}
          />
          {storyAlternatives && storyAlternatives.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {storyAlternatives.map((alt) => (
                <button
                  key={alt}
                  type="button"
                  className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700 hover:bg-violet-50 hover:border-violet-200"
                  onClick={() => onChange({ storyIdea: alt })}
                >
                  {alt.length > 48 ? `${alt.slice(0, 48)}…` : alt}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="rounded-lg border border-dashed border-violet-200 bg-violet-50/50 p-4 space-y-3">
        <p className="text-sm font-medium text-violet-900">Link video / transcript (tuỳ chọn)</p>
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

const PERSONAL_REWRITE_BUTTONS: { mode: PersonalRewriteMode; label: string }[] = [
  { mode: 'funnier', label: 'Hài hước hơn' },
  { mode: 'deeper', label: 'Sâu sắc hơn' },
  { mode: 'more_emotional', label: 'Cảm động hơn' },
  { mode: 'more_motivational', label: 'Truyền động lực' },
  { mode: 'shorter', label: 'Ngắn hơn' },
  { mode: 'longer', label: 'Dài hơn' },
  { mode: 'hooks_5', label: '5 hook' },
  { mode: 'openers_5', label: '5 góc mở bài' },
  { mode: 'ab_3', label: 'A/B x3' },
];

export function PersonalPostStudio({
  historyEditItem,
  onHistoryEditApplied,
  onHistoryChange,
}: {
  historyEditItem?: ContentHistoryItem | null;
  onHistoryEditApplied?: () => void;
  onHistoryChange?: () => void;
} = {}) {
  const { data: user } = useCurrentUser();
  const userId = user?.id;
  const { data: aiStatus, isLoading: aiStatusLoading, isError: aiStatusError } =
    useContentMarketingStatus();
  const { generatePersonal, analyzeVideo, scorePersonal, rewritePersonal, suggestPersonalIdeas } =
    useContentMarketingMutations();

  const [form, setForm] = useState<PersonalFormState>(defaultPersonalFormState);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [content, setContent] = useState('');
  const [scoreResult, setScoreResult] = useState<PersonalScoreResult | null>(null);
  const [videoAnalysis, setVideoAnalysis] = useState<VideoAnalysisResult | null>(null);
  const [variants, setVariants] = useState<string[]>([]);
  const [hooks, setHooks] = useState<string[]>([]);
  const [openers, setOpeners] = useState<string[]>([]);
  const [punchlines, setPunchlines] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [copyMsg, setCopyMsg] = useState('');
  const [suggestMsg, setSuggestMsg] = useState('');
  const [angleAlternatives, setAngleAlternatives] = useState<string[]>([]);
  const [storyAlternatives, setStoryAlternatives] = useState<string[]>([]);
  const [contentPreviewOpen, setContentPreviewOpen] = useState(false);
  const [lastGeneratedAt, setLastGeneratedAt] = useState<string | undefined>();

  useEffect(() => {
    const draft = loadPersonalDraft(userId);
    setForm(draft ?? defaultPersonalFormState);
    setDraftLoaded(true);
  }, [userId]);

  useEffect(() => {
    if (!historyEditItem || historyEditItem.tab !== 'personal') return;
    setContent(historyEditItem.content);
    setForm((prev) => ({
      ...prev,
      postTopic: historyEditItem.title?.trim() || prev.postTopic,
    }));
    setScoreResult(null);
    setVariants([]);
    setHooks([]);
    setOpeners([]);
    onHistoryEditApplied?.();
  }, [historyEditItem, onHistoryEditApplied]);

  const updateForm = useCallback((patch: Partial<PersonalFormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const isBusy =
    generatePersonal.isPending ||
    analyzeVideo.isPending ||
    scorePersonal.isPending ||
    rewritePersonal.isPending ||
    suggestPersonalIdeas.isPending;

  const handleSuggestIdeas = useCallback(async () => {
    if (!form.postTopic.trim()) return;
    setSuggestMsg('');
    const payload = {
      postTopic: form.postTopic,
      targetAudience: form.targetAudience || undefined,
      postGoal: form.postGoal,
      personalPostType: form.personalPostType,
      personalTone: form.personalTone,
    };
    try {
      const result = await suggestPersonalIdeas.mutateAsync(payload);
      updateForm({ personalAngle: result.personalAngle, storyIdea: result.storyIdea });
      setAngleAlternatives(result.angleAlternatives ?? []);
      setStoryAlternatives(result.storyAlternatives ?? []);
      setSuggestMsg(result.source === 'ai' ? 'Đã gợi ý bằng AI' : 'Đã gợi ý (template)');
    } catch {
      const local = suggestPersonalIdeasLocal(payload);
      updateForm({ personalAngle: local.personalAngle, storyIdea: local.storyIdea });
      setAngleAlternatives(local.angleAlternatives);
      setStoryAlternatives(local.storyAlternatives);
      setSuggestMsg('Đã gợi ý (offline — restart API để dùng AI đầy đủ)');
    }
    setTimeout(() => setSuggestMsg(''), 3000);
  }, [form, suggestPersonalIdeas, updateForm]);

  const handleGenerate = useCallback(async () => {
    if (!form.postTopic.trim()) return;
    setContent('');
    setScoreResult(null);
    setHooks([]);
    setOpeners([]);
    setPunchlines([]);
    setVariants([]);
    setVideoAnalysis(null);
    const result = await generatePersonal.mutateAsync(form);
    setLastGeneratedAt(new Date().toISOString());
    setContent(result.content);
    setScoreResult(result.score);
    setHooks(result.hooks ?? []);
    setOpeners(result.openers ?? []);
    setPunchlines(result.punchlines ?? []);
    setVariants([]);
    if (form.videoUrl.trim() || form.transcript.trim()) {
      const analysis = await analyzeVideo.mutateAsync({
        videoUrl: form.videoUrl || undefined,
        transcript: form.transcript || undefined,
      });
      setVideoAnalysis(analysis);
    }
  }, [form, generatePersonal, analyzeVideo]);

  const handleScore = useCallback(async () => {
    if (!content.trim()) return;
    const result = await scorePersonal.mutateAsync({ content });
    setScoreResult(result);
  }, [content, scorePersonal]);

  const handleRewrite = useCallback(
    async (mode: PersonalRewriteMode) => {
      if (!content.trim()) return;
      const result = await rewritePersonal.mutateAsync({
        content,
        mode,
        personalTone: form.personalTone,
      });
      setVariants(result.variants ?? []);
    },
    [content, form.personalTone, rewritePersonal],
  );

  const handleHooksOnly = useCallback(async () => {
    if (!content.trim()) return;
    const result = await rewritePersonal.mutateAsync({
      content,
      mode: 'hooks_5',
      personalTone: form.personalTone,
    });
    setHooks(result.variants ?? []);
  }, [content, form.personalTone, rewritePersonal]);

  const handleSave = useCallback(() => {
    savePersonalDraft(form, userId);
    if (content.trim()) {
      saveContentHistoryItem(
        {
          id: createHistoryId(),
          tab: 'personal',
          title: form.postTopic.slice(0, 60) || 'Bài cá nhân',
          content,
          contentScore: safeScore(scoreResult?.total),
          policyScore: safeScore(scoreResult?.criteria.naturalness),
          variantCount: variants.length,
          adsReadiness: scoreResult?.interactionReadiness ?? 'low',
          createdAt: new Date().toISOString(),
        },
        userId,
      );
      onHistoryChange?.();
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [form, userId, content, scoreResult, variants, onHistoryChange]);

  const handleSample = useCallback(() => {
    setForm(samplePersonalFormState);
  }, []);

  const handleCopy = useCallback(async () => {
    if (!content) return;
    await navigator.clipboard.writeText(content);
    setCopyMsg('Đã copy!');
    setTimeout(() => setCopyMsg(''), 2000);
  }, [content]);

  const errorMsg =
    formatMutationError(generatePersonal.error) ||
    formatMutationError(analyzeVideo.error) ||
    formatMutationError(scorePersonal.error) ||
    formatMutationError(rewritePersonal.error) ||
    formatMutationError(suggestPersonalIdeas.error) ||
    '';

  const hasResult = !!content.trim();

  if (!draftLoaded) return <LoadingState message="Đang tải nháp..." />;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-blue-100 bg-blue-50/80 px-4 py-3 text-sm text-blue-900">
        Tab này dùng để <strong>xây dựng thương hiệu cá nhân</strong> — chia sẻ kiến thức, cảm xúc,
        góc nhìn đời thường. Không phải nơi chốt sale hay bán hàng.
      </div>

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

      {hasResult && scoreResult && (
        <PersonalKpiBar score={scoreResult} variantCount={variants.length} />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b bg-slate-50 px-4 py-3">
            <h3 className="font-semibold text-slate-900">Form ý tưởng bài viết</h3>
            <p className="mt-0.5 text-xs text-slate-600">
              Hook → Câu chuyện → Góc nhìn → Bài học → CTA tương tác nhẹ
            </p>
          </div>
          <div className="p-4">
            <PersonalForm
              form={form}
              onChange={updateForm}
              onSuggestIdeas={handleSuggestIdeas}
              suggestingIdeas={suggestPersonalIdeas.isPending}
              suggestMsg={suggestMsg}
              angleAlternatives={angleAlternatives}
              storyAlternatives={storyAlternatives}
            />
          </div>
          <div className="flex flex-wrap gap-2 border-t bg-slate-50 p-4">
            <Button onClick={handleGenerate} disabled={isBusy || !form.postTopic.trim()}>
              {generatePersonal.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Tạo bài viết
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
          {generatePersonal.isPending && (
            <ContentGeneratingLoader
              title="Đang viết bài"
              subtitle="AI đang viết bài xây dựng thương hiệu — vui lòng đợi trong giây lát"
            />
          )}

          {!hasResult && !generatePersonal.isPending && (
            <EmptyState
              title="Chưa có bài viết"
              description="Nhập chủ đề và ý tưởng bên trái, bấm Tạo bài viết để xem nội dung, điểm tương tác và gợi ý cải thiện."
            />
          )}

          {hasResult && !generatePersonal.isPending && (
            <>
              <div className="content-result-box rounded-xl border border-slate-200 bg-white text-slate-900 shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                  <h3 className="font-semibold text-slate-900">Bài viết hoàn chỉnh</h3>
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
                      tab="personal"
                      title={form.postTopic}
                      content={content}
                      contentScore={scoreResult?.total}
                      variant="ghost"
                    />
                  </div>
                </div>
                <Textarea
                  className="min-h-[280px] rounded-none border-0 bg-white text-slate-900 placeholder:text-slate-400 focus-visible:ring-0"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
                <div className="flex flex-wrap gap-2 border-t p-3">
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
                  <Button size="sm" variant="outline" onClick={handleHooksOnly} disabled={isBusy}>
                    <Wand2 className="mr-1 h-3.5 w-3.5" />
                    Tạo hook
                  </Button>
                  {PERSONAL_REWRITE_BUTTONS.map(({ mode, label }) => (
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

              {scoreResult && (
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
                  <p className="font-semibold">
                    Điểm khả năng tương tác: {safeScore(scoreResult.total)}/100
                  </p>
                  <PersonalScoreBreakdown score={scoreResult} />
                  {scoreResult.strengths.length > 0 && (
                    <p className="text-sm text-emerald-700">
                      Điểm mạnh: {scoreResult.strengths.join(' · ')}
                    </p>
                  )}
                  {scoreResult.improvements.length > 0 && (
                    <p className="text-sm text-amber-800">
                      Gợi ý cải thiện: {scoreResult.improvements.join(' · ')}
                    </p>
                  )}
                  {scoreResult.naturalnessNotes.length > 0 && (
                    <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                      <p className="font-medium mb-1">Kiểm tra độ tự nhiên</p>
                      <ul className="list-disc pl-4 space-y-0.5">
                        {scoreResult.naturalnessNotes.map((n, i) => (
                          <li key={i}>{n}</li>
                        ))}
                      </ul>
                    </div>
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
                    <p>Ý tưởng: {videoAnalysis.contentIdeas.join(' · ')}</p>
                  )}
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

              {punchlines.length > 0 && (
                <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4 text-sm space-y-2">
                  <p className="font-semibold text-violet-900">
                    Câu đinh — cắt làm caption Facebook/TikTok
                  </p>
                  <ul className="space-y-2">
                    {punchlines.map((line, i) => (
                      <li
                        key={i}
                        className="rounded-lg border border-violet-100 bg-white px-3 py-2 text-slate-800 leading-snug cursor-pointer hover:border-violet-300 transition-colors"
                        title="Click để copy"
                        onClick={() => {
                          void navigator.clipboard.writeText(line);
                          setCopyMsg('Đã copy câu đinh!');
                          setTimeout(() => setCopyMsg(''), 2000);
                        }}
                      >
                        <span className="text-[10px] font-bold uppercase text-violet-500 mr-2">
                          {i + 1}
                        </span>
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(hooks.length > 0 || openers.length > 0) && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {hooks.length > 0 && (
                    <div className="rounded-xl border border-white/25 bg-[#0A3D30] p-3 text-sm text-white">
                      <p className="mb-1 font-semibold text-white">5 hook gợi ý</p>
                      <ul className="list-disc space-y-1 pl-4 text-white">
                        {hooks.map((h, i) => (
                          <li key={i} className="text-white">
                            {h}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {openers.length > 0 && (
                    <div className="rounded-xl border border-white/25 bg-[#0A3D30] p-3 text-sm text-white">
                      <p className="mb-1 font-semibold text-white">5 góc mở bài</p>
                      <ul className="list-disc space-y-1 pl-4 text-white">
                        {openers.map((o, i) => (
                          <li key={i} className="text-white">
                            {o}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-3 text-xs text-slate-600">
                <p className="font-medium text-slate-700 mb-1">
                  {form.personalTone === 'bold_may_tao'
                    ? 'CTA truyền cảm hứng gợi ý (không bán hàng)'
                    : 'CTA tương tác gợi ý (không bán hàng)'}
                </p>
                <p>
                  {(form.personalTone === 'bold_may_tao'
                    ? MAY_TAO_INSPIRATION_CTAS
                    : SOFT_INTERACTION_CTAS
                  ).join(' · ')}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {errorMsg && (
        <ErrorState message={errorMsg} onRetry={() => generatePersonal.reset()} />
      )}

      <ContentPreviewDialog
        open={contentPreviewOpen}
        onOpenChange={setContentPreviewOpen}
        title={form.postTopic}
        category="Xây Dựng Thương Hiệu"
        score={scoreResult?.total}
        createdAt={lastGeneratedAt}
        content={content}
        onContentChange={setContent}
      />
    </div>
  );
}
