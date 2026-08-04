'use client';

import { useState } from 'react';
import { Loader2, RefreshCw, Sparkles } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { suggestOpinionFieldLocal } from '@/lib/opinion-suggest-field';
import {
  OPINION_TOPIC_GROUPS,
  getOpinionTopicGroup,
  isLifeStoryTheme,
  pickRandomOpinionSubtopics,
  suggestOpinionTitlesLocal,
} from '@/lib/opinion-topic-themes';
import type { PersonalFormState } from '@/types/content-marketing';
import {
  OPINION_ANGLE_OPTIONS,
  OPINION_INTENSITY_OPTIONS,
  OPINION_LENGTH_OPTIONS,
  OPINION_PRONOUN_OPTIONS,
  OPINION_STANCE_OPTIONS,
} from '@/types/content-marketing';

export type PersonalOpinionFormProps = {
  form: PersonalFormState;
  onChange: (patch: Partial<PersonalFormState>) => void;
  onAnalyze?: () => void;
  analyzing?: boolean;
  analyzeMsg?: string;
  onSaveVoice?: () => void;
  savingVoice?: boolean;
  voiceMsg?: string;
  onSuggestField?: (
    field: 'summary' | 'debateIssue',
  ) => Promise<{ options: string[]; source: 'ai' | 'template' }>;
  suggestingField?: 'summary' | 'debateIssue' | null;
};

export function PersonalOpinionForm({
  form,
  onChange,
  onAnalyze,
  analyzing,
  analyzeMsg,
  onSaveVoice,
  savingVoice,
  voiceMsg,
  onSuggestField,
  suggestingField,
}: PersonalOpinionFormProps) {
  const [summaryOptions, setSummaryOptions] = useState<string[]>([]);
  const [debateOptions, setDebateOptions] = useState<string[]>([]);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [debateOpen, setDebateOpen] = useState(false);
  const [summaryMsg, setSummaryMsg] = useState('');
  const [debateMsg, setDebateMsg] = useState('');

  const hasSource = !!(form.opinionSourceUrl.trim() || form.opinionSourceText.trim());
  const theme = getOpinionTopicGroup(form.opinionThemeId) || OPINION_TOPIC_GROUPS[0] || null;
  const quickAngles = theme?.quickAngles ?? [];
  const isClip = form.opinionThemeId === 'clip_life_comment';
  const isLife = isLifeStoryTheme(form.opinionThemeId);
  const suggestedSubtopics = form.opinionSuggestedSubtopics ?? [];
  const generatedTitles = form.opinionGeneratedTitles ?? [];
  const canSuggestField = !!(
    form.opinionSubtopic.trim() ||
    form.opinionSourceText.trim() ||
    form.opinionSummary.trim() ||
    form.opinionSelectedTitle.trim() ||
    theme?.label
  );

  const rerollSubtopics = (exclude?: string[]) => {
    if (!theme) return;
    let next = pickRandomOpinionSubtopics(theme.id, {
      minCount: 5,
      maxCount: 8,
      exclude,
    });
    if (next.length < 5) {
      next = pickRandomOpinionSubtopics(theme.id, { minCount: 5, maxCount: 8 });
    }
    onChange({
      opinionSuggestedSubtopics: next,
      opinionSubtopic: '',
      opinionSelectedTitle: '',
      opinionGeneratedTitles: [],
      opinionUseCustomStory: false,
      opinionPickedSuggestedAngle: '',
    });
  };

  const handleSuggestField = async (field: 'summary' | 'debateIssue') => {
    const setMsg = field === 'summary' ? setSummaryMsg : setDebateMsg;
    const setOptions = field === 'summary' ? setSummaryOptions : setDebateOptions;
    const setOpen = field === 'summary' ? setSummaryOpen : setDebateOpen;
    setMsg('');
    const localInput = {
      field,
      themeLabel: theme?.label,
      subtopic: form.opinionSubtopic || form.opinionSelectedTitle,
      sourceText: form.opinionSourceText,
      currentSummary: form.opinionSummary,
    };
    try {
      const result = onSuggestField
        ? await onSuggestField(field)
        : suggestOpinionFieldLocal(localInput);
      setOptions(result.options);
      setOpen(true);
      setMsg(
        result.source === 'ai'
          ? 'Gợi ý từ AI — chọn 1 option bên dưới'
          : 'Gợi ý mẫu — chọn 1 option bên dưới',
      );
      setTimeout(() => setMsg(''), 4000);
    } catch {
      setOptions(suggestOpinionFieldLocal(localInput).options);
      setOpen(true);
      setMsg('Gợi ý mẫu (fallback)');
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-violet-100 bg-violet-50/80 px-3 py-2 text-xs text-violet-900">
        {isClip
          ? 'Luồng clip: Nguồn → Phân tích → Chủ đề / góc nhìn → Chính kiến → Bài Facebook + kịch bản.'
          : 'Luồng: Chọn nhóm → Random chủ đề con → Chọn / nhập chuyện → Gợi ý tiêu đề → Chính kiến → Bài Facebook + kịch bản.'}
      </div>

      <div className="space-y-1.5">
        <Label>1. Nhóm chủ đề lớn</Label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select
            value={form.opinionThemeId || theme?.id}
            onValueChange={(v) =>
              onChange({
                opinionThemeId: v,
                opinionSubtopic: '',
                opinionQuickAngleId: '',
                opinionSuggestedSubtopics: [],
                opinionGeneratedTitles: [],
                opinionSelectedTitle: '',
                opinionSuggestedAngles: [],
                opinionPickedSuggestedAngle: '',
                opinionUseCustomStory: false,
              })
            }
          >
            <SelectTrigger className="sm:flex-1">
              <SelectValue placeholder="Chọn nhóm chủ đề" />
            </SelectTrigger>
            <SelectContent>
              {OPINION_TOPIC_GROUPS.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isLife ? (
            <Button
              type="button"
              className="shrink-0 sm:min-w-[100px]"
              disabled={!theme}
              onClick={() => rerollSubtopics()}
            >
              <Sparkles className="mr-1.5 h-4 w-4" />
              Tạo
            </Button>
          ) : null}
        </div>
        {theme?.description ? (
          <p className="text-xs text-muted-foreground">{theme.description}</p>
        ) : null}
        {isLife ? (
          <p className="text-xs text-muted-foreground">
            Chọn nhóm rồi bấm Tạo để nhận 5–8 chủ đề con ngẫu nhiên (không trùng).
          </p>
        ) : null}
      </div>

      {isLife ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>2. Chủ đề con</Label>
            {suggestedSubtopics.length > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => rerollSubtopics(suggestedSubtopics)}
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Gợi ý chủ đề khác
              </Button>
            ) : null}
          </div>
          {suggestedSubtopics.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Bấm <span className="font-medium">Tạo</span> ở bước 1 để hiện chủ đề con.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {suggestedSubtopics.map((topic) => {
                  const active = !form.opinionUseCustomStory && form.opinionSubtopic === topic;
                  return (
                    <button
                      key={topic}
                      type="button"
                      onClick={() =>
                        onChange({
                          opinionSubtopic: topic,
                          opinionUseCustomStory: false,
                          opinionSelectedTitle: '',
                          opinionGeneratedTitles: [],
                          opinionPickedSuggestedAngle: '',
                          opinionSummary: form.opinionSummary || topic,
                        })
                      }
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
                <Label className="text-xs text-muted-foreground">
                  Hoặc nhập câu chuyện / chủ đề riêng
                </Label>
                <Textarea
                  rows={3}
                  value={form.opinionUseCustomStory ? form.opinionSourceText : ''}
                  placeholder="VD: Câu chuyện thật bạn muốn kể (không bịa nếu chưa có)..."
                  onChange={(e) =>
                    onChange({
                      opinionUseCustomStory: true,
                      opinionSourceText: e.target.value,
                      opinionSubtopic: e.target.value.slice(0, 120),
                      opinionSummary: e.target.value.slice(0, 500),
                      opinionSelectedTitle: '',
                      opinionGeneratedTitles: [],
                    })
                  }
                  onFocus={() => {
                    if (!form.opinionUseCustomStory) {
                      onChange({
                        opinionUseCustomStory: true,
                        opinionSubtopic: '',
                        opinionSelectedTitle: '',
                      });
                    }
                  }}
                />
              </div>
            </>
          )}
        </div>
      ) : theme ? (
        <div className="space-y-2">
          <Label>Chủ đề con</Label>
          <div className="flex flex-wrap gap-2">
            {theme.subtopics.map((topic) => {
              const active = form.opinionSubtopic === topic;
              return (
                <button
                  key={topic}
                  type="button"
                  onClick={() => onChange({ opinionSubtopic: topic })}
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
        </div>
      ) : null}

      {isLife && form.opinionSubtopic.trim() ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>3. Gợi ý tiêu đề / góc nhìn</Label>
            <div className="flex items-center gap-2">
              <Select
                value={String(form.opinionTitleCount || 10)}
                onValueChange={(v) =>
                  onChange({ opinionTitleCount: Number(v) as 5 | 10 })
                }
              >
                <SelectTrigger className="h-8 w-[88px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="10">10</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={form.opinionIsGeneratingTitles}
                onClick={() => {
                  const seed = (
                    form.opinionUseCustomStory
                      ? form.opinionSourceText || form.opinionSubtopic
                      : form.opinionSelectedTitle || form.opinionSubtopic
                  ).trim();
                  if (!seed && !form.opinionSubtopic.trim()) return;
                  const sub = form.opinionSubtopic.trim() || seed;
                  onChange({
                    opinionIsGeneratingTitles: true,
                    opinionGeneratedTitles: [],
                    opinionSelectedTitle: '',
                  });
                  const titles = suggestOpinionTitlesLocal({
                    subtopicLabel: sub,
                    topicGroupLabel: theme?.label,
                    count: form.opinionTitleCount || 10,
                  });
                  onChange({
                    opinionGeneratedTitles: titles,
                    opinionIsGeneratingTitles: false,
                    opinionSuggestedAngles: titles.slice(0, 5),
                  });
                }}
              >
                {form.opinionIsGeneratingTitles ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                )}
                Gợi ý
              </Button>
            </div>
          </div>
          {generatedTitles.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {generatedTitles.map((title) => {
                const active = form.opinionSelectedTitle === title;
                return (
                  <button
                    key={title}
                    type="button"
                    onClick={() =>
                      onChange({
                        opinionSelectedTitle: title,
                        opinionPickedSuggestedAngle: title,
                      })
                    }
                    className={cn(
                      'max-w-full rounded-full border border-[#0A3D31] bg-[#0A3D31] px-3 py-1.5 text-left text-xs transition sm:text-sm',
                      active
                        ? 'text-[#F97316] ring-1 ring-[#F97316]'
                        : 'text-white hover:brightness-110',
                    )}
                  >
                    {title}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Bấm Gợi ý để nhận 5–10 tiêu đề / góc nhìn.
            </p>
          )}
        </div>
      ) : null}

      {isClip ? (
        <>
          <div className="space-y-1.5">
            <Label>Link Reel / Facebook / TikTok / YouTube</Label>
            <Input
              value={form.opinionSourceUrl}
              onChange={(e) => onChange({ opinionSourceUrl: e.target.value })}
              placeholder="https://..."
            />
          </div>
          <div className="space-y-1.5">
            <Label>Dán caption / transcript (bắt buộc nếu không lấy được từ URL)</Label>
            <Textarea
              rows={5}
              value={form.opinionSourceText}
              onChange={(e) => onChange({ opinionSourceText: e.target.value })}
              placeholder={
                theme?.sourcePlaceholder ||
                'Dán nội dung bài viết, caption Facebook hoặc transcript video...'
              }
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={!hasSource || analyzing}
            onClick={onAnalyze}
          >
            {analyzing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            Phân tích câu chuyện
          </Button>
          {analyzeMsg ? <p className="text-xs text-muted-foreground">{analyzeMsg}</p> : null}
          {!hasSource ? (
            <p className="text-xs text-amber-700">
              Nhập URL hoặc dán caption/transcript để phân tích. Nếu không lấy được nội dung
              video, hãy dán thủ công.
            </p>
          ) : null}
        </>
      ) : null}

      {(form.opinionSuggestedAngles?.length ?? 0) > 0 && isClip ? (
        <div className="space-y-2">
          <Label>Góc nhìn gợi ý (chọn 1)</Label>
          <div className="flex flex-wrap gap-2">
            {form.opinionSuggestedAngles.map((angle) => {
              const active = form.opinionPickedSuggestedAngle === angle;
              return (
                <button
                  key={angle}
                  type="button"
                  onClick={() => onChange({ opinionPickedSuggestedAngle: angle })}
                  className={cn(
                    'max-w-full rounded-full border border-[#0A3D31] bg-[#0A3D31] px-3 py-1.5 text-left text-xs transition sm:text-sm',
                    active
                      ? 'text-[#F97316] ring-1 ring-[#F97316] ring-offset-1 ring-offset-[#2E594F]'
                      : 'text-white hover:brightness-110',
                  )}
                >
                  {angle}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label>Tóm tắt sự việc</Label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={!canSuggestField || suggestingField === 'summary'}
            onClick={() => void handleSuggestField('summary')}
          >
            {suggestingField === 'summary' ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="mr-1 h-3 w-3" />
            )}
            Gợi ý AI
          </Button>
        </div>
        <Textarea
          rows={3}
          value={form.opinionSummary}
          onChange={(e) => onChange({ opinionSummary: e.target.value })}
          placeholder="Tóm tắt trung lập — có thể chỉnh sau khi phân tích"
        />
        {summaryMsg ? <p className="text-xs text-emerald-700">{summaryMsg}</p> : null}
        {summaryOpen && summaryOptions.length > 0 ? (
          <div className="space-y-1.5 rounded-lg border bg-white p-2.5 text-slate-900">
            <p className="text-xs font-medium text-emerald-800">Chọn một gợi ý:</p>
            <div className="max-h-48 space-y-1.5 overflow-y-auto">
              {summaryOptions.map((opt, i) => (
                <button
                  key={`sum-${i}`}
                  type="button"
                  className={cn(
                    'w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-sm transition-colors hover:border-emerald-400 hover:bg-emerald-50',
                    form.opinionSummary === opt &&
                      'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-400/40',
                  )}
                  onClick={() => {
                    onChange({ opinionSummary: opt });
                    setSummaryOpen(false);
                  }}
                >
                  <span className="mr-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {i + 1}
                  </span>
                  {opt}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="text-xs text-slate-600 underline hover:text-slate-900"
              onClick={() => setSummaryOpen(false)}
            >
              Đóng
            </button>
          </div>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label>Vấn đề tranh luận</Label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={!canSuggestField || suggestingField === 'debateIssue'}
            onClick={() => void handleSuggestField('debateIssue')}
          >
            {suggestingField === 'debateIssue' ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="mr-1 h-3 w-3" />
            )}
            Gợi ý AI
          </Button>
        </div>
        <Textarea
          rows={2}
          value={form.opinionDebateIssue}
          onChange={(e) => onChange({ opinionDebateIssue: e.target.value })}
          placeholder="Công chúng đang bất đồng điều gì?"
        />
        {debateMsg ? <p className="text-xs text-emerald-700">{debateMsg}</p> : null}
        {debateOpen && debateOptions.length > 0 ? (
          <div className="space-y-1.5 rounded-lg border bg-white p-2.5 text-slate-900">
            <p className="text-xs font-medium text-emerald-800">Chọn một gợi ý:</p>
            <div className="max-h-48 space-y-1.5 overflow-y-auto">
              {debateOptions.map((opt, i) => (
                <button
                  key={`deb-${i}`}
                  type="button"
                  className={cn(
                    'w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-sm transition-colors hover:border-emerald-400 hover:bg-emerald-50',
                    form.opinionDebateIssue === opt &&
                      'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-400/40',
                  )}
                  onClick={() => {
                    onChange({ opinionDebateIssue: opt });
                    setDebateOpen(false);
                  }}
                >
                  <span className="mr-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {i + 1}
                  </span>
                  {opt}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="text-xs text-slate-600 underline hover:text-slate-900"
              onClick={() => setDebateOpen(false)}
            >
              Đóng
            </button>
          </div>
        ) : null}
      </div>

      {quickAngles.length > 0 ? (
        <div className="space-y-2">
          <Label>Góc nhìn nhanh</Label>
          <div className="flex flex-wrap gap-2">
            {quickAngles.map((angle) => {
              const active = form.opinionQuickAngleId === angle.id;
              return (
                <button
                  key={angle.id}
                  type="button"
                  onClick={() => {
                    const patch: Partial<PersonalFormState> = {
                      opinionQuickAngleId: angle.id,
                    };
                    if (angle.stanceHint) {
                      patch.opinionStance = angle.stanceHint as PersonalFormState['opinionStance'];
                    }
                    onChange(patch);
                  }}
                  className={cn(
                    'rounded-full border border-[#0A3D31] bg-[#0A3D31] px-3 py-1.5 text-xs transition sm:text-sm',
                    active
                      ? 'text-[#F97316] ring-1 ring-[#F97316]'
                      : 'text-white hover:brightness-110',
                  )}
                >
                  {angle.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label>Quan điểm</Label>
        <Select
          value={form.opinionStance}
          onValueChange={(v) =>
            onChange({ opinionStance: v as PersonalFormState['opinionStance'] })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OPINION_STANCE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {form.opinionStance === 'custom' || form.opinionQuickAngleId === 'custom_stance' ? (
          <Input
            className="mt-2"
            value={form.opinionStanceCustom}
            onChange={(e) => onChange({ opinionStanceCustom: e.target.value })}
            placeholder="Nhập quan điểm / chính kiến riêng..."
          />
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label>Góc nhìn (bổ sung)</Label>
        <Select
          value={form.opinionAngle}
          onValueChange={(v) =>
            onChange({ opinionAngle: v as PersonalFormState['opinionAngle'] })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OPINION_ANGLE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Chính kiến của bạn</Label>
        <Textarea
          rows={3}
          value={form.opinionThesis}
          onChange={(e) => onChange({ opinionThesis: e.target.value })}
          placeholder="Bạn muốn khẳng định / phản biện điều gì?"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Dữ kiện đã xác nhận</Label>
        <Textarea
          rows={2}
          value={(form.opinionConfirmedFacts ?? []).join('\n')}
          onChange={(e) =>
            onChange({
              opinionConfirmedFacts: e.target.value
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean),
            })
          }
          placeholder="Mỗi dòng một dữ kiện (từ phân tích hoặc tự điền)"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Thông tin chưa xác minh</Label>
        <Textarea
          rows={2}
          value={(form.opinionUnverifiedClaims ?? []).join('\n')}
          onChange={(e) =>
            onChange({
              opinionUnverifiedClaims: e.target.value
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean),
            })
          }
          placeholder="Mỗi dòng một cáo buộc / tin chưa kiểm chứng"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Cụm từ bạn thường nói</Label>
        <Input
          value={form.opinionCommonPhrases}
          onChange={(e) => onChange({ opinionCommonPhrases: e.target.value })}
          placeholder="Ví dụ: nói thật lòng · thôi thì · cái quan trọng là"
        />
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <input
          id="opinion-hide-names"
          type="checkbox"
          className="h-4 w-4"
          checked={form.opinionHideNames}
          onChange={(e) => onChange({ opinionHideNames: e.target.checked })}
        />
        <Label htmlFor="opinion-hide-names" className="cursor-pointer font-normal">
          Ẩn tên nhân vật (dùng nhân vật A/B)
        </Label>
      </div>

      <details className="rounded-lg border border-slate-200 bg-white p-3">
        <summary className="cursor-pointer text-sm font-medium text-slate-900">
          Cá nhân hóa giọng nói
        </summary>
        <div className="mt-3 space-y-3">
          <div className="space-y-1.5">
            <Label>Từ không muốn dùng</Label>
            <Input
              value={form.opinionAvoidWords}
              onChange={(e) => onChange({ opinionAvoidWords: e.target.value })}
              placeholder="Cách nhau bằng · hoặc ,"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Câu mở đầu quen thuộc</Label>
            <Input
              value={form.opinionOpeningPhrases}
              onChange={(e) => onChange({ opinionOpeningPhrases: e.target.value })}
              placeholder="Ví dụ: Mình nói thật lòng nhé"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Câu kết quen thuộc</Label>
            <Input
              value={form.opinionClosingPhrases}
              onChange={(e) => onChange({ opinionClosingPhrases: e.target.value })}
              placeholder="Ví dụ: Bạn nghĩ sao? Comment giúp mình"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Đoạn văn mẫu (AI học giọng, không copy nguyên văn)</Label>
            <Textarea
              rows={3}
              value={form.opinionSampleParagraph}
              onChange={(e) => onChange({ opinionSampleParagraph: e.target.value })}
              placeholder="Dán một đoạn bạn tự viết..."
            />
          </div>
          {onSaveVoice ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={onSaveVoice}
              disabled={savingVoice}
            >
              {savingVoice ? 'Đang lưu…' : 'Lưu giọng nói của tôi'}
            </Button>
          ) : null}
          {voiceMsg ? <p className="text-xs text-slate-600">{voiceMsg}</p> : null}
        </div>
      </details>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Xưng hô</Label>
          <Select
            value={form.opinionPronoun}
            onValueChange={(v) =>
              onChange({ opinionPronoun: v as PersonalFormState['opinionPronoun'] })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPINION_PRONOUN_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Mức độ</Label>
          <Select
            value={form.opinionIntensity}
            onValueChange={(v) =>
              onChange({ opinionIntensity: v as PersonalFormState['opinionIntensity'] })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPINION_INTENSITY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Độ dài</Label>
          <Select
            value={form.opinionLength}
            onValueChange={(v) =>
              onChange({ opinionLength: v as PersonalFormState['opinionLength'] })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPINION_LENGTH_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

export default PersonalOpinionForm;
