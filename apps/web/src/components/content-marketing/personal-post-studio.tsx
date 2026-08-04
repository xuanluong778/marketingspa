'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Heart,
  Loader2,
  Maximize2,
  MessageCircle,
  RefreshCw,
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
  clearPersonalDraft,
  createHistoryId,
  defaultPersonalFormState,
  loadPersonalWorkspaceDraft,
  samplePersonalFormState,
  saveContentHistoryItem,
  savePersonalDraft,
  savePersonalWorkspaceDraft,
} from '@/lib/content-marketing-form';
import { suggestPersonalIdeasLocal, suggestPersonalTitlesLocal } from '@/lib/personal-ideas-suggest';
import {
  BRAND_AUDIENCE_PRESETS,
  BRAND_TOPIC_GROUPS,
  pickRandomTopicsFromGroup,
  toSubtopicId,
} from '@/lib/brand-topic-themes';
import { getOpinionQuickAngle, getOpinionTopicGroup } from '@/lib/opinion-topic-themes';
import { formatMutationError } from '@/lib/format-mutation-error';
import { cn } from '@/lib/utils';
import { buildContentAutoPostHref } from '@/lib/content-auto-post-routes';
import { PresetOrCustomField } from '@/components/content-marketing/preset-or-custom-field';
import { ContentPreviewDialog } from '@/components/content-marketing/content-preview-dialog';
import { PersonalOpinionForm } from '@/components/content-marketing/personal-opinion-form';
import { MakeVideoButton } from '@/components/content-marketing/make-video-button';
import { CheckContentAdsButton } from '@/components/content-marketing/facebook-policy/check-content-ads-button';
import { SendToAutoPostButton } from '@/components/auto-post/send-to-auto-post-button';
import { ContentGeneratingLoader } from '@/components/content-marketing/content-generating-loader';
import type { ContentPolicySnapshot } from '@/lib/facebook-policy-ui';
import type {
  ContentHistoryItem,
  PersonalFormState,
  PersonalRewriteMode,
  PersonalScoreResult,
  VideoAnalysisResult,
} from '@/types/content-marketing';
import {
  PERSONAL_GOAL_OPTIONS,
  PERSONAL_TONE_OPTIONS,
  BRAND_PRONOUN_OPTIONS,
  BRAND_VOICE_INTENSITY_OPTIONS,
  POST_LENGTH_OPTIONS,
  MAY_TAO_INSPIRATION_CTAS,
  SOFT_INTERACTION_CTAS,
  OPINION_REWRITE_BUTTONS,
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

function splitPhrases(value: string): string[] | undefined {
  const parts = value
    .split(/[·|,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : undefined;
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

function BrandTopicPersonalForm({
  form,
  onChange,
  onSuggestIdeas,
  suggestingIdeas,
  suggestMsg,
  angleAlternatives,
  storyAlternatives,
  onRerollTopics,
  onGenerateTitles,
}: {
  form: PersonalFormState;
  onChange: (patch: Partial<PersonalFormState>) => void;
  onSuggestIdeas?: () => void;
  suggestingIdeas?: boolean;
  suggestMsg?: string;
  angleAlternatives?: string[];
  storyAlternatives?: string[];
  onRerollTopics?: () => void;
  onGenerateTitles?: () => void;
}) {
  const audienceOptions = useMemo(
    () => BRAND_AUDIENCE_PRESETS.map((v) => ({ value: v, label: v })),
    [],
  );

  const pickSubtopic = (value: string, custom: boolean) => {
    onChange({
      selectedSubtopic: value,
      useCustomTopic: custom,
      generatedTitles: [],
      selectedTitle: '',
      postTopic: '',
      isGeneratingTitles: false,
    });
  };

  const hasSuggested = form.suggestedTopics.length > 0;
  const storyReady = !!(form.selectedTitle || form.postTopic || form.selectedSubtopic).trim();

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label className="text-sm font-semibold text-slate-900">
          1. Chọn nhóm chủ đề <span className="text-destructive">*</span>
        </Label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select
            value={form.topicGroupId || undefined}
            onValueChange={(id) => {
              const group = BRAND_TOPIC_GROUPS.find((g) => g.id === id);
              if (!group) return;
              onChange({
                topicGroupId: group.id,
                topicGroupLabel: group.label,
                suggestedTopics: [],
                selectedSubtopic: '',
                postTopic: '',
                useCustomTopic: false,
                generatedTitles: [],
                selectedTitle: '',
                isGeneratingTitles: false,
                personalAngle: '',
                storyIdea: '',
              });
            }}
          >
            <SelectTrigger className="bg-white sm:flex-1">
              <SelectValue placeholder="Chọn nhóm chủ đề..." />
            </SelectTrigger>
            <SelectContent>
              {BRAND_TOPIC_GROUPS.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            className="shrink-0 sm:min-w-[100px]"
            disabled={!form.topicGroupId}
            onClick={() => {
              if (!form.topicGroupId) return;
              onChange({
                suggestedTopics: pickRandomTopicsFromGroup(form.topicGroupId, {
                  minCount: 5,
                  maxCount: 8,
                }),
                selectedSubtopic: '',
                postTopic: '',
                useCustomTopic: false,
                generatedTitles: [],
                selectedTitle: '',
                isGeneratingTitles: false,
              });
            }}
          >
            <Sparkles className="mr-1.5 h-4 w-4" />
            Tạo
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          Chọn nhóm rồi bấm Tạo để nhận 5–8 chủ đề con ngẫu nhiên.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label className="text-sm font-semibold text-slate-900">
            2. Chọn chủ đề nhỏ <span className="text-destructive">*</span>
          </Label>
          {hasSuggested ? (
            <Button type="button" size="sm" variant="outline" onClick={onRerollTopics}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Gợi ý chủ đề khác
            </Button>
          ) : null}
        </div>
        {hasSuggested ? (
          <>
            <div className="flex flex-wrap gap-2">
              {form.suggestedTopics.map((topic) => {
                const active = !form.useCustomTopic && form.selectedSubtopic === topic;
                return (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => pickSubtopic(topic, false)}
                    className={cn(
                      'max-w-full rounded-full border border-[#0A3D31] bg-[#0A3D31] px-3 py-1.5 text-left text-xs transition sm:text-sm',
                      active
                        ? 'text-[#F97316] ring-1 ring-[#F97316] ring-offset-1 ring-offset-[#2E594F]'
                        : 'text-white hover:brightness-110',
                    )}
                  >
                    {topic}
                  </button>
                );
              })}
            </div>
            <div className="space-y-1.5 pt-1">
              <Label className="text-xs text-slate-600">Hoặc nhập chủ đề riêng</Label>
              <Input
                value={form.useCustomTopic ? form.selectedSubtopic : ''}
                placeholder="VD: Câu chuyện thật bạn muốn kể..."
                onChange={(e) => pickSubtopic(e.target.value, true)}
                onFocus={() => {
                  if (!form.useCustomTopic) pickSubtopic('', true);
                }}
              />
            </div>
          </>
        ) : (
          <p className="text-xs text-slate-500">
            Chọn nhóm ở bước 1 và bấm <span className="font-medium">Tạo</span> để hiện chủ đề con.
          </p>
        )}
        {form.selectedSubtopic.trim() ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
            <span className="font-medium">Chủ đề nhỏ đang chọn: </span>
            {form.selectedSubtopic}
            {form.topicGroupLabel ? (
              <span className="mt-0.5 block text-xs text-emerald-800/80">
                Nhóm: {form.topicGroupLabel}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {form.selectedSubtopic.trim() ? (
        <div className="personal-title-box space-y-3 rounded-lg border border-slate-200 bg-white p-3 text-black">
          <Label className="personal-title-box_label block text-sm font-semibold !text-black">
            3. Tạo tiêu đề bài viết <span className="text-destructive">*</span>
          </Label>
          <div className="flex flex-wrap items-center gap-3 text-black">
            <span className="text-xs font-medium !text-black">Số lượng:</span>
            {([5, 10, 20] as const).map((count) => (
              <label
                key={count}
                className="personal-title-box_label flex cursor-pointer items-center gap-1.5 text-sm font-medium !text-black"
              >
                <input
                  type="radio"
                  name="titleCount"
                  checked={form.titleCount === count}
                  onChange={() => onChange({ titleCount: count })}
                  className="accent-[hsl(var(--brand))]"
                />
                <span className="!text-black">{count}</span>
              </label>
            ))}
            <Button
              type="button"
              size="sm"
              disabled={form.isGeneratingTitles || !form.selectedSubtopic.trim()}
              onClick={onGenerateTitles}
              className="text-white"
            >
              {form.isGeneratingTitles ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wand2 className="mr-1.5 h-3.5 w-3.5" />
              )}
              Tạo tiêu đề
            </Button>
          </div>
          {form.generatedTitles.length > 0 ? (
            <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
              {form.generatedTitles.map((title, idx) => {
                const active = form.selectedTitle === title;
                return (
                  <button
                    key={`${idx}-${title}`}
                    type="button"
                    onClick={() => onChange({ selectedTitle: title, postTopic: title })}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition !text-black',
                      active
                        ? 'border-[hsl(var(--brand))] bg-[hsl(var(--brand))]/10 shadow-sm'
                        : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                        active
                          ? 'bg-[hsl(var(--brand))] !text-white'
                          : 'bg-white !text-black ring-1 ring-slate-200',
                      )}
                    >
                      {idx + 1}
                    </span>
                    <span className="min-w-0 flex-1 font-medium !text-black">{title}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs !text-black">
              Chọn số lượng rồi bấm &quot;Tạo tiêu đề&quot;. Click một tiêu đề để điền vào bài viết.
            </p>
          )}
          {form.selectedTitle ? (
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
              <span className="font-medium">Tiêu đề bài viết: </span>
              {form.selectedTitle}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label className="text-sm font-semibold text-slate-900">4. Mục tiêu bài viết</Label>
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

      <PresetOrCustomField
        label="5. Đối tượng đọc"
        value={form.targetAudience}
        options={audienceOptions}
        placeholder="VD: Người đang tìm động lực thay đổi"
        onChange={(v) => onChange({ targetAudience: v })}
      />

      <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
        <Label className="text-sm font-semibold text-slate-900">6. Giọng văn / xưng hô</Label>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Xưng hô</Label>
            <Select
              value={form.brandPronoun}
              onValueChange={(v) =>
                onChange({ brandPronoun: v as PersonalFormState['brandPronoun'] })
              }
            >
              <SelectTrigger className="bg-white">
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
            <Label className="text-xs">Độ mạnh văn phong</Label>
            <Select
              value={form.brandVoiceIntensity}
              onValueChange={(v) =>
                onChange({ brandVoiceIntensity: v as PersonalFormState['brandVoiceIntensity'] })
              }
            >
              <SelectTrigger className="bg-white">
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
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Văn phong bổ sung</Label>
            <Select
              value={form.personalTone}
              onValueChange={(v) =>
                onChange({ personalTone: v as PersonalFormState['personalTone'] })
              }
            >
              <SelectTrigger className="bg-white">
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
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Độ dài</Label>
            <Select
              value={form.postLength}
              onValueChange={(v) => onChange({ postLength: v as PersonalFormState['postLength'] })}
            >
              <SelectTrigger className="bg-white">
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
      </div>

      <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 text-black [&_label]:text-black [&_p]:text-slate-700">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label className="text-sm font-semibold text-black">7. Câu chuyện thật</Label>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!storyReady || suggestingIdeas}
            onClick={onSuggestIdeas}
          >
            {suggestingIdeas ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            )}
            Gợi ý AI
          </Button>
        </div>
        {!storyReady ? (
          <p className="text-xs text-amber-700">
            Chọn chủ đề nhỏ (hoặc tiêu đề) ở bước trên rồi bấm Gợi ý AI.
          </p>
        ) : null}
        {suggestMsg ? <p className="text-xs text-emerald-700">{suggestMsg}</p> : null}
        <p className="text-xs text-slate-500">
          Chỉ kể trải nghiệm bạn thật sự có. Nếu để trống, AI sẽ viết góc nhìn chung — không bịa
          thành tích giúp bạn.
        </p>
        <div className="space-y-1.5">
          <Label>Góc nhìn muốn khai thác</Label>
          <Textarea
            value={form.personalAngle}
            placeholder="VD: Thất bại không định nghĩa bạn — cách đứng dậy mới quan trọng"
            rows={2}
            onChange={(e) => onChange({ personalAngle: e.target.value })}
          />
          {angleAlternatives && angleAlternatives.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {angleAlternatives.map((alt) => (
                <button
                  key={alt}
                  type="button"
                  className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700 hover:bg-violet-50"
                  onClick={() => onChange({ personalAngle: alt })}
                >
                  {alt.length > 48 ? `${alt.slice(0, 48)}…` : alt}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label>Câu chuyện thật / ý tưởng thô</Label>
          <Textarea
            value={form.storyIdea}
            placeholder="Khó khăn gặp phải → bạn đã xử lý thế nào → bài học rút ra..."
            rows={4}
            onChange={(e) => onChange({ storyIdea: e.target.value })}
          />
          {storyAlternatives && storyAlternatives.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {storyAlternatives.map((alt) => (
                <button
                  key={alt}
                  type="button"
                  className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700 hover:bg-violet-50"
                  onClick={() => onChange({ storyIdea: alt })}
                >
                  {alt.length > 48 ? `${alt.slice(0, 48)}…` : alt}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-dashed border-violet-200 bg-violet-50/50 p-4">
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
  const {
    generatePersonal,
    generateOpinion,
    analyzeOpinionStory,
    analyzeVideo,
    scorePersonal,
    rewritePersonal,
    rewriteOpinion,
    suggestPersonalIdeas,
    suggestPersonalTitles,
    suggestOpinionField,
    saveOpinionVoiceProfile,
  } = useContentMarketingMutations();

  const [form, setForm] = useState<PersonalFormState>(defaultPersonalFormState);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [content, setContent] = useState('');
  const [videoScript, setVideoScript] = useState('');
  const [videoHook, setVideoHook] = useState('');
  const [savedContentId, setSavedContentId] = useState<string | null>(null);
  const [scoreResult, setScoreResult] = useState<PersonalScoreResult | null>(null);
  const [videoAnalysis, setVideoAnalysis] = useState<VideoAnalysisResult | null>(null);
  const [variants, setVariants] = useState<string[]>([]);
  const [hooks, setHooks] = useState<string[]>([]);
  const [openers, setOpeners] = useState<string[]>([]);
  const [punchlines, setPunchlines] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [copyMsg, setCopyMsg] = useState('');
  const [scriptCopyMsg, setScriptCopyMsg] = useState('');
  const [suggestMsg, setSuggestMsg] = useState('');
  const [analyzeMsg, setAnalyzeMsg] = useState('');
  const [voiceMsg, setVoiceMsg] = useState('');
  const [suggestingField, setSuggestingField] = useState<'summary' | 'debateIssue' | null>(null);
  const [angleAlternatives, setAngleAlternatives] = useState<string[]>([]);
  const [storyAlternatives, setStoryAlternatives] = useState<string[]>([]);
  const [contentPreviewOpen, setContentPreviewOpen] = useState(false);
  const [lastGeneratedAt, setLastGeneratedAt] = useState<string | undefined>();
  const [policySnapshot, setPolicySnapshot] = useState<ContentPolicySnapshot | null>(null);
  /** Loading tạo bài — bật sync trước mutate để cuộn tới vùng kết quả sau khi React render. */
  const [isCreatingLoading, setIsCreatingLoading] = useState(false);
  const resultSectionRef = useRef<HTMLDivElement>(null);
  const scrollToResultLockRef = useRef(false);

  useEffect(() => {
    const draft = loadPersonalWorkspaceDraft(userId);
    if (draft) {
      setForm(draft.form);
      setContent(draft.content);
      setVideoScript(draft.videoScript);
      setVideoHook(draft.videoHook);
      setSavedContentId(draft.savedContentId);
      setScoreResult((draft.scoreResult as PersonalScoreResult | null) ?? null);
      setVideoAnalysis((draft.videoAnalysis as VideoAnalysisResult | null) ?? null);
      setPolicySnapshot((draft.policySnapshot as ContentPolicySnapshot | null) ?? null);
      setVariants(draft.variants);
      setHooks(draft.hooks);
      setOpeners(draft.openers);
      setPunchlines(draft.punchlines);
      setAngleAlternatives(draft.angleAlternatives);
      setStoryAlternatives(draft.storyAlternatives);
      setLastGeneratedAt(draft.lastGeneratedAt);
    } else {
      setForm(defaultPersonalFormState);
    }
    setDraftLoaded(true);
  }, [userId]);

  useEffect(() => {
    if (!draftLoaded || isCreatingLoading) return;
    const timer = window.setTimeout(() => {
      savePersonalWorkspaceDraft(
        {
          form,
          content,
          videoScript,
          videoHook,
          originalContent: content,
          originalScript: videoScript,
          opinionWarnings: [],
          showCompare: false,
          savedContentId,
          variants,
          hooks,
          openers,
          punchlines,
          angleAlternatives,
          storyAlternatives,
          lastGeneratedAt,
          scoreResult,
          naturalness: null,
          videoAnalysis,
          policySnapshot,
        },
        userId,
      );
    }, 400);
    return () => window.clearTimeout(timer);
  }, [
    draftLoaded,
    isCreatingLoading,
    form,
    content,
    videoScript,
    videoHook,
    savedContentId,
    variants,
    hooks,
    openers,
    punchlines,
    angleAlternatives,
    storyAlternatives,
    lastGeneratedAt,
    scoreResult,
    videoAnalysis,
    policySnapshot,
    userId,
  ]);

  useEffect(() => {
    if (!historyEditItem || historyEditItem.tab !== 'personal') return;
    setContent(historyEditItem.content);
    setVideoScript(historyEditItem.videoScript || '');
    setVideoHook(historyEditItem.videoHook || '');
    setSavedContentId(historyEditItem.id);
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

  const isOpinion = form.creationMode === 'opinion';

  const isGeneratingResult =
    isCreatingLoading || generatePersonal.isPending || generateOpinion.isPending;

  const isBusy =
    isGeneratingResult ||
    analyzeOpinionStory.isPending ||
    analyzeVideo.isPending ||
    scorePersonal.isPending ||
    rewritePersonal.isPending ||
    rewriteOpinion.isPending ||
    suggestPersonalIdeas.isPending ||
    suggestPersonalTitles.isPending;

  useEffect(() => {
    if (!isCreatingLoading) {
      scrollToResultLockRef.current = false;
      return;
    }
    if (scrollToResultLockRef.current) return;
    scrollToResultLockRef.current = true;
    // Double rAF: đảm bảo React đã commit + browser đã paint vùng loading.
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resultSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [isCreatingLoading]);

  const topicReady = !!(form.selectedTitle || form.postTopic || form.selectedSubtopic).trim();
  const canGenerate = isOpinion
    ? !!(
        form.opinionThesis.trim() ||
        form.opinionSummary.trim() ||
        form.opinionSubtopic.trim() ||
        form.opinionSelectedTitle.trim()
      )
    : topicReady;

  const handleRerollTopics = useCallback(() => {
    if (!form.topicGroupId) return;
    updateForm({
      suggestedTopics: pickRandomTopicsFromGroup(form.topicGroupId, {
        minCount: 5,
        maxCount: 8,
        exclude: form.suggestedTopics,
      }),
      selectedSubtopic: '',
      postTopic: '',
      useCustomTopic: false,
      generatedTitles: [],
      selectedTitle: '',
      isGeneratingTitles: false,
    });
  }, [form.topicGroupId, form.suggestedTopics, updateForm]);

  const handleGenerateTitles = useCallback(async () => {
    const sub = form.selectedSubtopic.trim();
    if (!sub) return;
    updateForm({ isGeneratingTitles: true, generatedTitles: [], selectedTitle: '' });
    const payload = {
      topicGroupId: form.topicGroupId || undefined,
      topicGroupLabel: form.topicGroupLabel || undefined,
      subtopicId: toSubtopicId(sub),
      subtopicLabel: sub,
      count: form.titleCount,
      tone: form.personalTone,
      pronoun: form.brandPronoun,
      audience: form.targetAudience || undefined,
      goal: form.postGoal,
    };
    try {
      const result = await suggestPersonalTitles.mutateAsync(payload);
      const titles =
        Array.isArray(result.titles) && result.titles.length > 0
          ? result.titles
          : suggestPersonalTitlesLocal(payload).titles;
      updateForm({ generatedTitles: titles, selectedTitle: '', isGeneratingTitles: false });
    } catch {
      updateForm({
        generatedTitles: suggestPersonalTitlesLocal(payload).titles,
        selectedTitle: '',
        isGeneratingTitles: false,
      });
    }
  }, [form, suggestPersonalTitles, updateForm]);

  const handleSuggestIdeas = useCallback(async () => {
    const topic = (form.selectedTitle || form.postTopic || form.selectedSubtopic).trim();
    if (!topic) return;
    setSuggestMsg('');
    const payload = {
      postTopic: topic,
      topicGroupId: form.topicGroupId || undefined,
      topicGroupLabel: form.topicGroupLabel || undefined,
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

  const buildOpinionPayload = useCallback(() => {
    const theme = getOpinionTopicGroup(form.opinionThemeId);
    const quick = getOpinionQuickAngle(form.opinionThemeId, form.opinionQuickAngleId);
    const selectedAngle =
      form.opinionSelectedTitle ||
      form.opinionPickedSuggestedAngle ||
      quick?.angleHint ||
      form.opinionSubtopic ||
      theme?.label ||
      '';
    return {
      sourceSummary: form.opinionSummary || form.opinionSourceText || form.opinionSubtopic || undefined,
      confirmedFacts: form.opinionConfirmedFacts,
      unverifiedClaims: form.opinionUnverifiedClaims,
      selectedAngle,
      angle: form.opinionAngle,
      userViewpoint:
        form.opinionStance === 'custom'
          ? form.opinionStanceCustom || form.opinionThesis
          : form.opinionThesis || form.opinionStanceCustom || undefined,
      pronoun: form.opinionPronoun,
      intensity: form.opinionIntensity,
      length: form.opinionLength,
      commonPhrases: splitPhrases(form.opinionCommonPhrases),
      hideNames: form.opinionHideNames,
      preferredWords: splitPhrases(form.opinionCommonPhrases),
      avoidWords: splitPhrases(form.opinionAvoidWords),
      openingPhrases: splitPhrases(form.opinionOpeningPhrases),
      closingPhrases: splitPhrases(form.opinionClosingPhrases),
      sampleParagraph: form.opinionSampleParagraph.trim() || undefined,
      themeId: form.opinionThemeId || undefined,
      subtopic: form.opinionSubtopic || undefined,
      quickAngleLabel: quick?.label || undefined,
    };
  }, [form]);

  const handleAnalyzeOpinion = useCallback(async () => {
    setAnalyzeMsg('');
    try {
      const result = await analyzeOpinionStory.mutateAsync({
        sourceUrl: form.opinionSourceUrl.trim() || undefined,
        sourceText: form.opinionSourceText.trim() || undefined,
        transcript: form.transcript.trim() || undefined,
      });
      const full = (result as { _full?: {
        confirmedFacts?: string[];
        unverifiedClaims?: string[];
        extractedText?: string;
      } })._full;
      updateForm({
        opinionSummary: result.summary || form.opinionSummary,
        opinionDebateIssue: result.debateIssue || form.opinionDebateIssue,
        opinionSuggestedAngles: result.suggestedAngles?.length
          ? result.suggestedAngles.slice(0, 5)
          : form.opinionSuggestedAngles,
        opinionPickedSuggestedAngle: '',
        opinionConfirmedFacts: full?.confirmedFacts?.length
          ? full.confirmedFacts
          : form.opinionConfirmedFacts,
        opinionUnverifiedClaims: full?.unverifiedClaims?.length
          ? full.unverifiedClaims
          : form.opinionUnverifiedClaims,
        opinionSourceText:
          full?.extractedText && !form.opinionSourceText.trim()
            ? full.extractedText
            : form.opinionSourceText,
        postTopic:
          result.debateIssue?.slice(0, 120) || result.summary?.slice(0, 120) || form.postTopic,
      });
      setAnalyzeMsg(result.source === 'ai' ? 'Đã phân tích bằng AI' : 'Đã phân tích (template)');
    } catch {
      setAnalyzeMsg('Không phân tích được — thử dán caption/transcript thủ công');
    }
  }, [analyzeOpinionStory, form, updateForm]);

  const handleSuggestOpinionField = useCallback(
    async (field: 'summary' | 'debateIssue') => {
      setSuggestingField(field);
      try {
        const theme = getOpinionTopicGroup(form.opinionThemeId);
        return await suggestOpinionField.mutateAsync({
          field,
          themeId: form.opinionThemeId || undefined,
          themeLabel: theme?.label,
          subtopic: form.opinionSubtopic || form.opinionSelectedTitle,
          sourceText: form.opinionSourceText,
          currentSummary: form.opinionSummary,
          currentDebateIssue: form.opinionDebateIssue,
        });
      } finally {
        setSuggestingField(null);
      }
    },
    [form, suggestOpinionField],
  );

  const handleSaveVoice = useCallback(async () => {
    setVoiceMsg('');
    try {
      await saveOpinionVoiceProfile.mutateAsync({
        pronoun: form.opinionPronoun,
        preferredWords: splitPhrases(form.opinionCommonPhrases),
        avoidWords: splitPhrases(form.opinionAvoidWords),
        openingPhrases: splitPhrases(form.opinionOpeningPhrases),
        closingPhrases: splitPhrases(form.opinionClosingPhrases),
        sampleParagraph: form.opinionSampleParagraph || undefined,
      });
      setVoiceMsg('Đã lưu giọng nói');
    } catch {
      setVoiceMsg('Không lưu được giọng nói — thử lại');
    }
  }, [form, saveOpinionVoiceProfile]);

  const handleGenerate = useCallback(async () => {
    if (!canGenerate) return;
    if (isCreatingLoading || generatePersonal.isPending || generateOpinion.isPending) return;

    setIsCreatingLoading(true);
    setContent('');
    setVideoScript('');
    setVideoHook('');
    setScoreResult(null);
    setHooks([]);
    setOpeners([]);
    setPunchlines([]);
    setVariants([]);
    setVideoAnalysis(null);
    setPolicySnapshot(null);

    try {
      if (isOpinion) {
        const result = await generateOpinion.mutateAsync(buildOpinionPayload());
        setLastGeneratedAt(new Date().toISOString());
        setContent(result.facebookPost);
        setVideoScript(result.videoScript);
        setVideoHook(result.videoHook);
        setHooks(result.videoHook ? [result.videoHook] : []);
        if (!form.postTopic.trim()) {
          updateForm({
            postTopic:
              form.opinionSelectedTitle ||
              form.opinionSubtopic ||
              form.opinionSummary.slice(0, 80) ||
              'Góc nhìn & chính kiến',
          });
        }
        return;
      }

      const topicForm: PersonalFormState = {
        ...form,
        postTopic: (form.selectedTitle || form.postTopic || form.selectedSubtopic).trim(),
      };
      const result = await generatePersonal.mutateAsync(topicForm);
      setLastGeneratedAt(new Date().toISOString());
      setContent(result.content);
      setScoreResult(result.score);
      setHooks(result.hooks ?? []);
      setOpeners(result.openers ?? []);
      setPunchlines(result.punchlines ?? []);
      if (form.videoUrl.trim() || form.transcript.trim()) {
        const analysis = await analyzeVideo.mutateAsync({
          videoUrl: form.videoUrl || undefined,
          transcript: form.transcript || undefined,
        });
        setVideoAnalysis(analysis);
      }
    } finally {
      setIsCreatingLoading(false);
    }
  }, [
    canGenerate,
    isCreatingLoading,
    isOpinion,
    form,
    generateOpinion,
    generatePersonal,
    analyzeVideo,
    buildOpinionPayload,
    updateForm,
  ]);

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

  const handleOpinionRewrite = useCallback(
    async (mode: (typeof OPINION_REWRITE_BUTTONS)[number]['mode']) => {
      if (!content.trim() && !videoScript.trim()) return;
      const result = await rewriteOpinion.mutateAsync({
        ...buildOpinionPayload(),
        rewriteMode: mode,
        facebookPost: content || undefined,
        videoScript: videoScript || undefined,
        videoHook: videoHook || undefined,
      });
      setContent(result.facebookPost);
      setVideoScript(result.videoScript);
      setVideoHook(result.videoHook);
    },
    [content, videoScript, videoHook, rewriteOpinion, buildOpinionPayload],
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
    const topic = (form.selectedTitle || form.postTopic || form.selectedSubtopic).trim();
    const draftForm = { ...form, postTopic: topic || form.postTopic };
    savePersonalDraft(draftForm, userId);
    if (content.trim()) {
      const id = savedContentId || createHistoryId();
      saveContentHistoryItem(
        {
          id,
          tab: 'personal',
          title: topic.slice(0, 60) || 'Bài cá nhân',
          content,
          videoScript: videoScript || undefined,
          videoHook: videoHook || undefined,
          contentScore: safeScore(scoreResult?.total),
          policyScore: safeScore(scoreResult?.criteria.naturalness),
          variantCount: variants.length,
          adsReadiness: scoreResult?.interactionReadiness ?? 'low',
          createdAt: new Date().toISOString(),
        },
        userId,
      );
      setSavedContentId(id);
      onHistoryChange?.();
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [
    form,
    userId,
    content,
    videoScript,
    videoHook,
    scoreResult,
    variants,
    savedContentId,
    onHistoryChange,
  ]);

  const handleSample = useCallback(() => {
    setForm({ ...samplePersonalFormState, creationMode: form.creationMode });
  }, [form.creationMode]);

  const handleReset = useCallback(() => {
    const dirty = !!(
      content.trim() ||
      videoScript.trim() ||
      form.topicGroupId ||
      form.postTopic.trim() ||
      form.selectedSubtopic.trim() ||
      form.suggestedTopics.length ||
      form.generatedTitles.length ||
      form.personalAngle.trim() ||
      form.storyIdea.trim() ||
      form.opinionSummary.trim() ||
      form.opinionThesis.trim() ||
      form.opinionSubtopic.trim()
    );
    if (dirty && !window.confirm('Làm mới form và xóa kết quả hiện tại?')) return;
    const nextForm = { ...defaultPersonalFormState, creationMode: form.creationMode };
    setForm(nextForm);
    setContent('');
    setVideoScript('');
    setVideoHook('');
    setSavedContentId(null);
    setScoreResult(null);
    setVariants([]);
    setHooks([]);
    setOpeners([]);
    setPunchlines([]);
    setVideoAnalysis(null);
    setPolicySnapshot(null);
    setAngleAlternatives([]);
    setStoryAlternatives([]);
    setLastGeneratedAt(undefined);
    clearPersonalDraft(userId);
    savePersonalWorkspaceDraft(
      {
        form: nextForm,
        content: '',
        videoScript: '',
        videoHook: '',
        originalContent: '',
        originalScript: '',
        opinionWarnings: [],
        showCompare: false,
        savedContentId: null,
        variants: [],
        hooks: [],
        openers: [],
        punchlines: [],
        angleAlternatives: [],
        storyAlternatives: [],
        lastGeneratedAt: undefined,
        scoreResult: null,
        naturalness: null,
        videoAnalysis: null,
        policySnapshot: null,
      },
      userId,
      { force: true },
    );
  }, [content, videoScript, form, userId]);

  const handleCopy = useCallback(async () => {
    if (!content) return;
    await navigator.clipboard.writeText(content);
    setCopyMsg('Đã copy!');
    setTimeout(() => setCopyMsg(''), 2000);
  }, [content]);

  const handleCopyScript = useCallback(async () => {
    if (!videoScript.trim()) return;
    await navigator.clipboard.writeText(videoScript);
    setScriptCopyMsg('Đã copy kịch bản!');
    setTimeout(() => setScriptCopyMsg(''), 2000);
  }, [videoScript]);

  const errorMsg =
    formatMutationError(generatePersonal.error) ||
    formatMutationError(generateOpinion.error) ||
    formatMutationError(analyzeOpinionStory.error) ||
    formatMutationError(analyzeVideo.error) ||
    formatMutationError(scorePersonal.error) ||
    formatMutationError(rewritePersonal.error) ||
    formatMutationError(rewriteOpinion.error) ||
    formatMutationError(suggestPersonalIdeas.error) ||
    '';

  const hasResult = !!content.trim();
  const resultTitle =
    form.selectedTitle || form.postTopic || form.opinionSummary || 'Bài xây dựng thương hiệu';
  const sourceRoute = buildContentAutoPostHref('create', { section: 'personal' });

  if (!draftLoaded) return <LoadingState message="Đang tải nháp..." />;

  return (
    <div className="space-y-6 pb-24">
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

      {hasResult && scoreResult && !isOpinion && (
        <PersonalKpiBar score={scoreResult} variantCount={variants.length} />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="space-y-3 border-b bg-slate-50 px-4 py-3">
            <div>
              <h3 className="font-semibold text-slate-900">Form ý tưởng bài viết</h3>
              <p className="mt-0.5 text-xs text-slate-600">
                {isOpinion
                  ? 'Nguồn → Tóm tắt → Tranh luận → Góc nhìn → Chính kiến → Bài viết'
                  : 'Hook → Câu chuyện → Góc nhìn → Bài học → CTA tương tác nhẹ'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Chế độ viết bài">
              {(
                [
                  { value: 'topic' as const, label: 'Chủ đề thương hiệu' },
                  { value: 'opinion' as const, label: 'Góc nhìn & Chính kiến' },
                ] as const
              ).map((mode) => {
                const active = form.creationMode === mode.value;
                return (
                  <button
                    key={mode.value}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => updateForm({ creationMode: mode.value })}
                    className={cn(
                      'inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-bold text-black',
                      'bg-[#00E073] transition-shadow duration-150',
                      'hover:brightness-[1.03] focus-visible:outline-none',
                      active
                        ? 'border-2 border-white shadow-[0_0_0_2px_#00E073,0_0_14px_rgba(0,224,115,0.95),0_0_28px_rgba(255,255,255,0.35)]'
                        : 'border-2 border-transparent hover:border-white/80 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.7),0_0_10px_rgba(0,224,115,0.55)]',
                    )}
                  >
                    {mode.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="p-4">
            {isOpinion ? (
              <PersonalOpinionForm
                form={form}
                onChange={updateForm}
                onAnalyze={() => void handleAnalyzeOpinion()}
                analyzing={analyzeOpinionStory.isPending}
                analyzeMsg={analyzeMsg}
                onSaveVoice={() => void handleSaveVoice()}
                savingVoice={saveOpinionVoiceProfile.isPending}
                voiceMsg={voiceMsg}
                onSuggestField={handleSuggestOpinionField}
                suggestingField={suggestingField}
              />
            ) : (
              <BrandTopicPersonalForm
                form={form}
                onChange={updateForm}
                onSuggestIdeas={() => void handleSuggestIdeas()}
                suggestingIdeas={suggestPersonalIdeas.isPending}
                suggestMsg={suggestMsg}
                angleAlternatives={angleAlternatives}
                storyAlternatives={storyAlternatives}
                onRerollTopics={handleRerollTopics}
                onGenerateTitles={() => void handleGenerateTitles()}
              />
            )}
          </div>
          <div className="fixed bottom-0 left-0 right-0 z-40 flex h-[60px] flex-wrap items-center gap-2 border-t border-white/10 bg-[#2E594F] px-4 shadow-[0_-6px_16px_rgba(15,23,42,0.12)] lg:left-64">
            <Button onClick={() => void handleGenerate()} disabled={isBusy || !canGenerate}>
              {isGeneratingResult ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              {isOpinion ? 'Viết theo quan điểm của tôi' : 'Tạo bài viết'}
            </Button>
            <Button
              variant="outline"
              className="border-[#0A3D30] bg-[#0A3D30] text-white hover:bg-[#083028] hover:text-white [&_svg]:text-white"
              onClick={handleReset}
              aria-label="Làm mới form"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Làm mới
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

        <div
          ref={resultSectionRef}
          className="min-h-[320px] scroll-mt-24 space-y-4"
        >
          {isGeneratingResult && (
            <ContentGeneratingLoader
              title="Đang viết bài"
              subtitle={
                isOpinion
                  ? 'AI đang viết bài Facebook + kịch bản camera — vui lòng đợi'
                  : 'AI đang viết bài xây dựng thương hiệu — vui lòng đợi trong giây lát'
              }
            />
          )}

          {!hasResult && !isGeneratingResult && (
            <EmptyState
              className="text-white [&_svg]:text-white"
              title="Chưa có bài viết"
              description="Nhập chủ đề và ý tưởng bên trái, bấm Tạo bài viết để xem nội dung, điểm tương tác và gợi ý cải thiện."
            />
          )}

          {hasResult && !isGeneratingResult && (
            <>
              <div className="content-result-box rounded-xl border border-slate-200 bg-white text-slate-900 shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                  <h3 className="font-semibold text-slate-900">Bài viết hoàn chỉnh</h3>
                  <div className="flex flex-wrap items-center gap-1 text-slate-800">
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
                      onClick={() => void handleCopy()}
                    >
                      <Copy className="mr-1 h-4 w-4" />
                      {copyMsg || 'Copy'}
                    </Button>
                    <SendToAutoPostButton
                      tab="personal"
                      title={resultTitle}
                      content={content}
                      contentScore={scoreResult?.total}
                      variant="ghost"
                    />
                    <MakeVideoButton
                      title={resultTitle}
                      content={content}
                      facebookPost={content}
                      videoScript={videoScript || content}
                      videoHook={videoHook || undefined}
                      sourceType={isOpinion ? 'opinion' : 'personal_brand'}
                      sourceContentId={savedContentId || undefined}
                      sourceRoute={sourceRoute}
                      originalScript={videoScript || content}
                      editedScript={videoScript || content}
                      variant="ghost"
                      className="h-8 border border-[#0A3D30] bg-[#0A3D30] px-2.5 text-xs text-white hover:!bg-[#0A3D30] hover:text-[#F97316] [&_svg]:text-white hover:[&_svg]:text-[#F97316]"
                    />
                    <CheckContentAdsButton
                      title={resultTitle}
                      content={content}
                      mode="facebook_post"
                      snapshot={policySnapshot}
                      onSnapshotChange={(snap) => setPolicySnapshot(snap)}
                      variant="ghost"
                      showBadge={false}
                      label="Check Ads"
                      className="h-8 border border-[#0A3D30] bg-[#0A3D30] px-2.5 text-xs text-white hover:!bg-[#0A3D30] hover:text-[#F97316] [&_svg]:text-white hover:[&_svg]:text-[#F97316]"
                    />
                  </div>
                </div>
                <Textarea
                  className="min-h-[280px] rounded-none border-0 bg-white text-slate-900 placeholder:text-slate-400 focus-visible:ring-0"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
                <div className="flex flex-wrap gap-2 border-t p-3">
                  {!isOpinion ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-[#0A3D30] bg-[#0A3D30] text-white hover:border-[#0A3D30] hover:bg-[#0A3D30] hover:text-[#F97316] [&_svg]:text-white hover:[&_svg]:text-[#F97316]"
                        onClick={() => void handleScore()}
                        disabled={isBusy}
                      >
                        <Star className="mr-1 h-3.5 w-3.5" />
                        Chấm điểm
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleHooksOnly()}
                        disabled={isBusy}
                      >
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
                          onClick={() => void handleRewrite(mode)}
                        >
                          {label}
                        </Button>
                      ))}
                    </>
                  ) : (
                    OPINION_REWRITE_BUTTONS.map(({ mode, label }) => (
                      <Button
                        key={mode}
                        size="sm"
                        variant="secondary"
                        className="border-[#0A3D30] bg-[#0A3D30] text-white hover:border-[#0A3D30] hover:bg-[#0A3D30] hover:text-[#F97316]"
                        disabled={isBusy}
                        onClick={() => void handleOpinionRewrite(mode)}
                      >
                        {label}
                      </Button>
                    ))
                  )}
                </div>
              </div>

              {isOpinion && videoScript.trim() ? (
                <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b px-4 py-3">
                    <h3 className="font-semibold text-slate-900">Kịch bản nói trước camera</h3>
                    <Button variant="ghost" size="sm" onClick={() => void handleCopyScript()}>
                      <Copy className="mr-1 h-4 w-4" />
                      {scriptCopyMsg || 'Copy kịch bản'}
                    </Button>
                  </div>
                  {videoHook ? (
                    <p className="border-b px-4 py-2 text-sm text-slate-600">
                      Hook 5–10s: {videoHook}
                    </p>
                  ) : null}
                  <Textarea
                    className="min-h-[180px] rounded-none border-0"
                    value={videoScript}
                    onChange={(e) => setVideoScript(e.target.value)}
                  />
                </div>
              ) : null}

              {scoreResult && !isOpinion && (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
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
                </div>
              )}

              {variants.length > 0 && (
                <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="font-semibold">Phiên bản viết lại</p>
                  {variants.map((v, i) => (
                    <div key={i} className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm">
                      {v}
                    </div>
                  ))}
                </div>
              )}

              {punchlines.length > 0 && (
                <div className="space-y-2 rounded-xl border border-violet-200 bg-violet-50/40 p-4 text-sm">
                  <p className="font-semibold text-violet-900">
                    Câu đinh — cắt làm caption Facebook/TikTok
                  </p>
                  <ul className="space-y-2">
                    {punchlines.map((line, i) => (
                      <li
                        key={i}
                        className="cursor-pointer rounded-lg border border-violet-100 bg-white px-3 py-2 leading-snug text-slate-800 transition-colors hover:border-violet-300"
                        title="Click để copy"
                        onClick={() => {
                          void navigator.clipboard.writeText(line);
                          setCopyMsg('Đã copy câu đinh!');
                          setTimeout(() => setCopyMsg(''), 2000);
                        }}
                      >
                        <span className="mr-2 text-[10px] font-bold uppercase text-violet-500">
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
                          <li key={i}>{h}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {openers.length > 0 && (
                    <div className="rounded-xl border border-white/25 bg-[#0A3D30] p-3 text-sm text-white">
                      <p className="mb-1 font-semibold text-white">5 góc mở bài</p>
                      <ul className="list-disc space-y-1 pl-4 text-white">
                        {openers.map((o, i) => (
                          <li key={i}>{o}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {!isOpinion && (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-3 text-xs text-slate-600">
                  <p className="mb-1 font-medium text-slate-700">
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
              )}
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
        title={resultTitle}
        category="Xây Dựng Thương Hiệu"
        score={scoreResult?.total}
        createdAt={lastGeneratedAt}
        content={content}
        onContentChange={setContent}
      />
    </div>
  );
}
