'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Copy,
  FileText,
  Loader2,
  Maximize2,
  RefreshCw,
  Save,
  Sparkles,
  Type,
  Megaphone,
  PencilLine,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorState } from '@/components/shared/page-state';
import { useCurrentUser } from '@/hooks/use-auth';
import {
  useContentMarketingMutations,
  useContentMarketingStatus,
} from '@/hooks/use-content-marketing';
import {
  clearAdvancedWorkspaceDraft,
  createHistoryId,
  defaultAdvancedFormState,
  emptyAdvancedWorkspaceDraft,
  loadAdvancedWorkspaceDraft,
  sampleAdvancedFormState,
  saveAdvancedDraft,
  saveAdvancedWorkspaceDraft,
  saveContentHistoryItem,
} from '@/lib/content-marketing-form';
import { formatMutationError } from '@/lib/format-mutation-error';
import { PresetOrCustomField } from '@/components/content-marketing/preset-or-custom-field';
import { AdvancedArticleContent } from '@/components/content-marketing/advanced-article-content';
import { SendToAutoPostButton } from '@/components/auto-post/send-to-auto-post-button';
import { ContentGeneratingLoader } from '@/components/content-marketing/content-generating-loader';
import { ContentPreviewDialog } from '@/components/content-marketing/content-preview-dialog';
import { AiSuggestTextareaField } from '@/components/content-marketing/ai-suggest-textarea-field';
import {
  buildFacebookPostText,
  FacebookPostContent,
} from '@/components/content-marketing/facebook-post-content';
import { suggestAdvancedFieldLocal } from '@/lib/advanced-field-suggest';
import type {
  AdvancedArticleResult,
  AdvancedFieldSuggestion,
  AdvancedFormState,
  AdvancedSuggestField,
  ContentHistoryItem,
} from '@/types/content-marketing';
import {
  ADVANCED_ARTICLE_GOAL_OPTIONS,
  ADVANCED_CTA_OPTIONS,
  ADVANCED_DEMOGRAPHIC_OPTIONS,
  ADVANCED_LENGTH_OPTIONS,
  ADVANCED_WRITING_STYLE_OPTIONS,
  PRODUCT_SERVICE_OPTIONS,
} from '@/types/content-marketing';
import { useT } from '@/i18n/i18n-provider';

type VariantTab = 'main' | 'facebook' | 'website' | 'ads';

export interface AdvancedPostStudioProps {
  historyEditItem?: ContentHistoryItem | null;
  onHistoryEditApplied?: () => void;
  onHistoryChange?: () => void;
}

export function AdvancedPostStudio({
  historyEditItem,
  onHistoryEditApplied,
  onHistoryChange,
}: AdvancedPostStudioProps) {
  const t = useT();
  const { data: user } = useCurrentUser();
  const { data: aiStatus } = useContentMarketingStatus();
  const { generateAdvanced, suggestAdvancedField, rewriteAdvanced, optimizeAdvancedCta, generateAdvancedTitles } =
    useContentMarketingMutations();

  const [suggestingField, setSuggestingField] = useState<AdvancedSuggestField | null>(null);

  const [form, setForm] = useState<AdvancedFormState>(defaultAdvancedFormState);
  const [result, setResult] = useState<AdvancedArticleResult | null>(null);
  const [variantTab, setVariantTab] = useState<VariantTab>('main');
  const [titleOptions, setTitleOptions] = useState<string[]>([]);
  const [copyMsg, setCopyMsg] = useState('');
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [isCreatingLoading, setIsCreatingLoading] = useState(false);
  const [contentPreviewOpen, setContentPreviewOpen] = useState(false);
  const [analysisExpanded, setAnalysisExpanded] = useState(false);
  const resultSectionRef = useRef<HTMLDivElement>(null);
  const scrollToResultLockRef = useRef(false);

  const patch = useCallback((p: Partial<AdvancedFormState>) => {
    setForm((prev) => {
      const next = { ...prev, ...p };
      saveAdvancedDraft(next, user?.id);
      return next;
    });
  }, [user?.id]);

  useEffect(() => {
    const draft = loadAdvancedWorkspaceDraft(user?.id);
    if (draft) {
      setForm(draft.form);
      setResult((draft.result as AdvancedArticleResult | null) ?? null);
      setVariantTab(
        (['main', 'facebook', 'website', 'ads'] as const).includes(draft.variantTab as VariantTab)
          ? (draft.variantTab as VariantTab)
          : 'main',
      );
      setTitleOptions(draft.titleOptions);
    }
    setDraftLoaded(true);
  }, [user?.id]);

  useEffect(() => {
    if (!draftLoaded || isCreatingLoading) return;
    const timer = window.setTimeout(() => {
      saveAdvancedWorkspaceDraft(
        {
          form,
          result,
          variantTab,
          titleOptions,
        },
        user?.id,
      );
    }, 400);
    return () => window.clearTimeout(timer);
  }, [draftLoaded, isCreatingLoading, form, result, variantTab, titleOptions, user?.id]);

  useEffect(() => {
    if (historyEditItem?.tab === 'advanced') {
      setForm((prev) => ({ ...prev, productService: historyEditItem.title }));
      setResult({
        title: historyEditItem.title,
        hook: '',
        final_article: historyEditItem.content,
        cta: '',
        hashtags: [],
        analysis_16_steps: [],
        suggested_images: [],
        suggested_ads_angle: '',
        variants: { facebook: historyEditItem.content, website: historyEditItem.content, ads: historyEditItem.content },
        source: 'template',
      });
      onHistoryEditApplied?.();
    }
  }, [historyEditItem, onHistoryEditApplied]);

  useEffect(() => {
    if (!isCreatingLoading) {
      scrollToResultLockRef.current = false;
      return;
    }
    if (scrollToResultLockRef.current) return;
    scrollToResultLockRef.current = true;
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resultSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [isCreatingLoading]);

  const displayContent = (): string => {
    if (!result) return '';
    if (variantTab === 'facebook') return result.variants.facebook;
    if (variantTab === 'website') return result.variants.website;
    if (variantTab === 'ads') return result.variants.ads;
    return result.final_article;
  };

  const handleFieldSuggest = useCallback(
    async (field: AdvancedSuggestField): Promise<AdvancedFieldSuggestion> => {
      setSuggestingField(field);
      const payload = {
        field,
        productService: form.productService,
        demographic: form.demographic,
        articleGoal: form.articleGoal,
        writingStyle: form.writingStyle,
        painPoints: form.painPoints || undefined,
        currentValue: form[field] || undefined,
      };
      try {
        return await suggestAdvancedField.mutateAsync(payload);
      } catch {
        return suggestAdvancedFieldLocal({ field, productService: form.productService });
      } finally {
        setSuggestingField(null);
      }
    },
    [form, suggestAdvancedField],
  );

  const handleGenerate = async () => {
    setErrorMsg('');
    if (!form.productService.trim() || !form.painPoints.trim()) {
      setErrorMsg('Vui lòng nhập tên dịch vụ và nỗi đau khách hàng.');
      return;
    }
    if (isCreatingLoading || generateAdvanced.isPending) return;
    setIsCreatingLoading(true);
    setResult(null);
    setAnalysisExpanded(false);
    try {
      const data = await generateAdvanced.mutateAsync(form);
      setResult(data);
      setVariantTab('main');
      setTitleOptions([]);
    } catch (e) {
      setErrorMsg(formatMutationError(e));
    } finally {
      setIsCreatingLoading(false);
    }
  };

  const handleRewriteChannel = async () => {
    if (!result) return;
    setErrorMsg('');
    const previousArticle = displayContent();
    try {
      const data = await rewriteAdvanced.mutateAsync({
        ...form,
        previousArticle,
        channel: variantTab,
      });
      setResult((prev) => {
        if (!prev) return data;
        if (variantTab === 'main') {
          return {
            ...prev,
            title: data.title || prev.title,
            hook: data.hook || prev.hook,
            final_article: data.final_article || prev.final_article,
            cta: data.cta || prev.cta,
            hashtags: data.hashtags?.length ? data.hashtags : prev.hashtags,
            analysis_16_steps: data.analysis_16_steps?.length
              ? data.analysis_16_steps
              : prev.analysis_16_steps,
            source: data.source,
          };
        }
        if (variantTab === 'facebook') {
          return {
            ...prev,
            hook: data.hook || prev.hook,
            cta: data.cta || prev.cta,
            variants: {
              ...prev.variants,
              facebook: data.variants.facebook || prev.variants.facebook,
            },
            source: data.source,
          };
        }
        if (variantTab === 'website') {
          return {
            ...prev,
            variants: {
              ...prev.variants,
              website: data.variants.website || prev.variants.website,
            },
            source: data.source,
          };
        }
        return {
          ...prev,
          suggested_ads_angle: data.suggested_ads_angle || prev.suggested_ads_angle,
          variants: {
            ...prev.variants,
            ads: data.variants.ads || prev.variants.ads,
          },
          source: data.source,
        };
      });
    } catch (e) {
      setErrorMsg(formatMutationError(e));
    }
  };

  const handleOptimizeCta = async () => {
    if (!result) return;
    setErrorMsg('');
    try {
      const data = await optimizeAdvancedCta.mutateAsync({
        finalArticle: displayContent(),
        ctaType: form.ctaType,
        productService: form.productService,
        articleGoal: form.articleGoal,
        industryId: form.industryId || undefined,
        industryName: form.industryName || undefined,
        customIndustry: form.customIndustry || undefined,
      });
      setResult((prev) => {
        if (!prev) return prev;
        const next = { ...prev, cta: data.cta || prev.cta };
        if (variantTab === 'main') next.final_article = data.updated_article;
        else if (variantTab === 'facebook') {
          next.variants = { ...prev.variants, facebook: data.updated_article };
        } else if (variantTab === 'website') {
          next.variants = { ...prev.variants, website: data.updated_article };
        } else {
          next.variants = { ...prev.variants, ads: data.updated_article };
        }
        return next;
      });
    } catch (e) {
      setErrorMsg(formatMutationError(e));
    }
  };

  const handleSuggestTitles = async () => {
    if (!result) return;
    setErrorMsg('');
    try {
      const data = await generateAdvancedTitles.mutateAsync({
        finalArticle: result.final_article || displayContent(),
        productService: form.productService,
        demographic: form.demographic,
        industryId: form.industryId || undefined,
        industryName: form.industryName || undefined,
        customIndustry: form.customIndustry || undefined,
      });
      setTitleOptions(data.titles || []);
    } catch (e) {
      setErrorMsg(formatMutationError(e));
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    let text = displayContent();
    if (variantTab === 'main' || variantTab === 'facebook') {
      text = buildFacebookPostText({
        hook: result.hook,
        body: variantTab === 'main' ? result.final_article : result.variants.facebook,
        cta: result.cta,
        hashtags: result.hashtags,
      });
    }
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopyMsg('Đã copy!');
    setTimeout(() => setCopyMsg(''), 2000);
  };

  const handlePreviewContentChange = (value: string) => {
    if (!result) return;
    if (variantTab === 'facebook') {
      setResult({ ...result, variants: { ...result.variants, facebook: value } });
    } else if (variantTab === 'website') {
      setResult({ ...result, variants: { ...result.variants, website: value } });
    } else if (variantTab === 'ads') {
      setResult({ ...result, variants: { ...result.variants, ads: value } });
    } else {
      setResult({ ...result, final_article: value });
    }
  };

  const handleSave = () => {
    saveAdvancedWorkspaceDraft(
      { form, result, variantTab, titleOptions },
      user?.id,
      { force: true },
    );
    if (!result) return;
    const item: ContentHistoryItem = {
      id: createHistoryId(),
      tab: 'advanced',
      title: result.title || form.productService,
      content: buildFacebookPostText({
        hook: result.hook,
        body: result.final_article,
        cta: result.cta,
        hashtags: result.hashtags,
      }),
      contentScore: 0,
      policyScore: 0,
      variantCount: 3,
      adsReadiness: 'medium',
      createdAt: new Date().toISOString(),
    };
    saveContentHistoryItem(item, user?.id);
    onHistoryChange?.();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSample = () => {
    setForm(sampleAdvancedFormState);
    saveAdvancedDraft(sampleAdvancedFormState, user?.id);
  };

  const handleReset = () => {
    const dirty = !!(
      result ||
      form.productService.trim() ||
      form.painPoints.trim() ||
      form.desires.trim()
    );
    if (dirty && !window.confirm('Làm mới form và xóa kết quả hiện tại?')) return;
    setForm(defaultAdvancedFormState);
    setResult(null);
    setVariantTab('main');
    setTitleOptions([]);
    setErrorMsg('');
    clearAdvancedWorkspaceDraft(user?.id);
    saveAdvancedWorkspaceDraft(emptyAdvancedWorkspaceDraft(), user?.id, { force: true });
  };

  const isGeneratingResult = isCreatingLoading || generateAdvanced.isPending;
  const channelBusy =
    rewriteAdvanced.isPending ||
    optimizeAdvancedCta.isPending ||
    generateAdvancedTitles.isPending;
  const busy = isGeneratingResult || channelBusy;

  return (
    <div className="advanced-write-tab space-y-4 pb-24">
      {!aiStatus?.aiConfigured && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          AI chưa cấu hình — hệ thống dùng bản mẫu. Thêm OPENAI_API_KEY vào .env để bật AI.
        </div>
      )}

      {copyMsg && <span className="text-sm text-emerald-300">{copyMsg}</span>}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Cột trái — form */}
        <div className="advanced-write-form space-y-4 rounded-xl border border-white/20 bg-[#0A3D30] p-4 text-white md:p-5">
          <h3 className="flex items-center gap-2 font-semibold text-white">
            <FileText className="h-4 w-4 text-white" /> Thông tin bài viết
          </h3>

          <PresetOrCustomField
            label="Tên dịch vụ / sản phẩm spa"
            required
            value={form.productService}
            options={PRODUCT_SERVICE_OPTIONS}
            placeholder="VD: Liệu trình trị nám chuyên sâu"
            onChange={(v) => patch({ productService: v })}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-white">Giá bán</Label>
              <Input value={form.price} onChange={(e) => patch({ price: e.target.value })} placeholder="2.990.000đ" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-white">Thời hạn ưu đãi</Label>
              <Input value={form.offerDeadline} onChange={(e) => patch({ offerDeadline: e.target.value })} placeholder="31/12/2026" />
            </div>
          </div>

          <AiSuggestTextareaField
            label={<span className="text-white">Combo / ưu đãi</span>}
            field="combo"
            value={form.combo}
            onChange={(v) => patch({ combo: v })}
            rows={2}
            placeholder="Mua 8 tặng 2 buổi"
            productService={form.productService}
            onSuggest={() => handleFieldSuggest('combo')}
            isSuggesting={suggestingField === 'combo'}
          />

          <AiSuggestTextareaField
            label={<span className="text-white">Quà tặng</span>}
            field="gift"
            value={form.gift}
            onChange={(v) => patch({ gift: v })}
            rows={2}
            placeholder="Serum mini, voucher..."
            productService={form.productService}
            onSuggest={() => handleFieldSuggest('gift')}
            isSuggesting={suggestingField === 'gift'}
          />

          <div className="space-y-1.5">
            <Label className="text-white">Khu vực bán hàng</Label>
            <Input value={form.salesArea} onChange={(e) => patch({ salesArea: e.target.value })} placeholder="Quận 1, TP.HCM" />
          </div>

          <AiSuggestTextareaField
            label="Cam kết / chứng nhận"
            field="certification"
            value={form.certification}
            onChange={(v) => patch({ certification: v })}
            rows={2}
            productService={form.productService}
            onSuggest={() => handleFieldSuggest('certification')}
            isSuggesting={suggestingField === 'certification'}
          />

          <AiSuggestTextareaField
            label="Câu chuyện khách hàng / case study"
            field="caseStudy"
            value={form.caseStudy}
            onChange={(v) => patch({ caseStudy: v })}
            rows={3}
            productService={form.productService}
            onSuggest={() => handleFieldSuggest('caseStudy')}
            isSuggesting={suggestingField === 'caseStudy'}
          />

          <AiSuggestTextareaField
            label="Nỗi đau khách hàng"
            field="painPoints"
            value={form.painPoints}
            onChange={(v) => patch({ painPoints: v })}
            rows={3}
            required
            productService={form.productService}
            onSuggest={() => handleFieldSuggest('painPoints')}
            isSuggesting={suggestingField === 'painPoints'}
          />

          <AiSuggestTextareaField
            label="Mong muốn khách hàng"
            field="desires"
            value={form.desires}
            onChange={(v) => patch({ desires: v })}
            rows={2}
            productService={form.productService}
            onSuggest={() => handleFieldSuggest('desires')}
            isSuggesting={suggestingField === 'desires'}
          />

          <AiSuggestTextareaField
            label="Điểm khác biệt của spa"
            field="differentiator"
            value={form.differentiator}
            onChange={(v) => patch({ differentiator: v })}
            rows={2}
            productService={form.productService}
            onSuggest={() => handleFieldSuggest('differentiator')}
            isSuggesting={suggestingField === 'differentiator'}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-white">Phong cách viết</Label>
              <Select value={form.writingStyle} onValueChange={(v) => patch({ writingStyle: v as AdvancedFormState['writingStyle'] })}>
                <SelectTrigger className="border-slate-200 bg-white text-slate-900"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ADVANCED_WRITING_STYLE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-white">Nhân khẩu học</Label>
              <Select value={form.demographic} onValueChange={(v) => patch({ demographic: v as AdvancedFormState['demographic'] })}>
                <SelectTrigger className="border-slate-200 bg-white text-slate-900"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ADVANCED_DEMOGRAPHIC_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-white">Mục tiêu bài viết</Label>
              <Select value={form.articleGoal} onValueChange={(v) => patch({ articleGoal: v as AdvancedFormState['articleGoal'] })}>
                <SelectTrigger className="border-slate-200 bg-white text-slate-900"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ADVANCED_ARTICLE_GOAL_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-white">CTA</Label>
              <Select value={form.ctaType} onValueChange={(v) => patch({ ctaType: v as AdvancedFormState['ctaType'] })}>
                <SelectTrigger className="border-slate-200 bg-white text-slate-900"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ADVANCED_CTA_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-white">Độ dài bài viết</Label>
            <Select value={form.postLength} onValueChange={(v) => patch({ postLength: v as AdvancedFormState['postLength'] })}>
              <SelectTrigger className="border-slate-200 bg-white text-slate-900"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ADVANCED_LENGTH_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label} ({o.hint})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="fixed bottom-0 left-0 right-0 z-40 flex h-[60px] flex-wrap items-center gap-2 border-t border-white/10 bg-[#2E594F] px-4 shadow-[0_-6px_16px_rgba(15,23,42,0.12)] lg:left-64">
            <Button onClick={() => void handleGenerate()} disabled={busy}>
              {isGeneratingResult ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Tạo bài viết
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-[#0A3D30] bg-[#0A3D30] text-white hover:bg-[#083028] hover:text-white [&_svg]:text-white"
              onClick={handleReset}
              aria-label="Làm mới form"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Làm mới
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-[#0A3D30] bg-[#0A3D30] text-white hover:bg-[#083028] hover:text-white [&_svg]:text-white"
              onClick={handleSample}
            >
              Dùng mẫu
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-[#0A3D30] bg-[#0A3D30] text-white hover:bg-[#083028] hover:text-white [&_svg]:text-white"
              onClick={handleSave}
              disabled={busy}
            >
              <Save className="mr-2 h-4 w-4" />
              {saved ? 'Đã lưu!' : 'Lưu'}
            </Button>
          </div>
        </div>

        {/* Cột phải — kết quả */}
        <div
          ref={resultSectionRef}
          className="advanced-result-panel min-h-[320px] scroll-mt-24 space-y-4 text-white"
        >
          {isGeneratingResult && (
            <ContentGeneratingLoader
              title="Đang tạo bài viết"
              subtitle="AI đang viết bài theo khung 16 bước — vui lòng đợi trong giây lát"
            />
          )}

          {!result && !isGeneratingResult && (
            <EmptyState title={t('content.emptyPosts')} description={t('content.emptyPostsHint')} />
          )}

          {result && !isGeneratingResult && (
            <>
              <div className="space-y-3 rounded-xl border border-white/20 bg-[#0A3D30] p-0 text-white md:p-0 overflow-hidden">
                <div className="advanced-result-actions flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3 text-slate-900">
                  <h3 className="font-semibold text-slate-900">Kết quả content</h3>
                  <div className="flex flex-wrap items-center gap-1 text-slate-800">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-slate-800 hover:text-slate-900"
                      onClick={() => void handleRewriteChannel()}
                      disabled={busy || !displayContent().trim()}
                      title="Viết lại đúng tab đang chọn"
                    >
                      {rewriteAdvanced.isPending ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : (
                        <PencilLine className="mr-1 h-4 w-4" />
                      )}
                      Viết lại
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-slate-800 hover:text-slate-900"
                      onClick={() => void handleOptimizeCta()}
                      disabled={busy || !displayContent().trim()}
                      title="Tối ưu CTA cho nội dung đang xem"
                    >
                      {optimizeAdvancedCta.isPending ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : (
                        <Megaphone className="mr-1 h-4 w-4" />
                      )}
                      Tối ưu CTA
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-slate-800 hover:text-slate-900"
                      onClick={() => void handleSuggestTitles()}
                      disabled={busy || !result.final_article.trim()}
                      title="Gợi ý tiêu đề"
                    >
                      {generateAdvancedTitles.isPending ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : (
                        <Type className="mr-1 h-4 w-4" />
                      )}
                      Gợi ý tiêu đề
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-slate-800 hover:text-slate-900"
                      onClick={() => setContentPreviewOpen(true)}
                      disabled={!displayContent().trim()}
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
                      tab="advanced"
                      title={result.title || form.productService}
                      content={
                        variantTab === 'main' || variantTab === 'facebook'
                          ? buildFacebookPostText({
                              hook: result.hook,
                              body:
                                variantTab === 'main'
                                  ? result.final_article
                                  : result.variants.facebook,
                              cta: result.cta,
                              hashtags: result.hashtags,
                            })
                          : displayContent()
                      }
                      variant="ghost"
                    />
                  </div>
                </div>

                <div className="space-y-3 px-4 py-4 md:px-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="w-full space-y-2">
                    <h3 className="text-lg font-bold leading-snug text-white">{result.title}</h3>
                    {result.hook && variantTab !== 'main' && (
                      <blockquote className="rounded-r-md border-l-4 border-orange-400/70 bg-white/10 px-4 py-2.5 text-sm italic text-white">
                        {result.hook}
                      </blockquote>
                    )}
                    <Badge className="border-white/30 bg-white/15 text-white hover:bg-white/20">
                      {result.source === 'ai' ? 'AI' : 'Mẫu'}
                    </Badge>
                  </div>
                </div>

                <Tabs value={variantTab} onValueChange={(v) => setVariantTab(v as VariantTab)}>
                  <TabsList className="flex h-auto flex-wrap border border-white/20 bg-[#083028]">
                    <TabsTrigger
                      value="main"
                      className="text-white data-[state=active]:bg-white data-[state=active]:text-slate-900"
                    >
                      Bài chính
                    </TabsTrigger>
                    <TabsTrigger
                      value="facebook"
                      className="text-white data-[state=active]:bg-white data-[state=active]:text-slate-900"
                    >
                      Facebook
                    </TabsTrigger>
                    <TabsTrigger
                      value="website"
                      className="text-white data-[state=active]:bg-white data-[state=active]:text-slate-900"
                    >
                      Website
                    </TabsTrigger>
                    <TabsTrigger
                      value="ads"
                      className="text-white data-[state=active]:bg-white data-[state=active]:text-slate-900"
                    >
                      Quảng cáo
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                <div className="advanced-result-article max-h-[min(560px,70vh)] overflow-y-auto rounded-lg border border-slate-200 bg-white p-4 text-slate-900 shadow-inner md:p-5">
                  {variantTab === 'main' || variantTab === 'facebook' ? (
                    <div className="space-y-4">
                      {variantTab === 'main' && result.hook && (
                        <p className="whitespace-pre-wrap text-[15px] font-medium leading-[1.85] text-slate-800">
                          {result.hook}
                        </p>
                      )}
                      <FacebookPostContent content={displayContent()} />
                    </div>
                  ) : (
                    <AdvancedArticleContent content={displayContent()} />
                  )}
                </div>

                {(variantTab === 'main' || variantTab === 'facebook') && (
                  <p className="text-xs text-white/80">
                    Bài viết liền mạch — sẵn sàng copy đăng Facebook
                  </p>
                )}

                {result.cta && (
                  <div className="rounded-lg border border-orange-400/50 bg-white/10 px-4 py-3">
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-orange-300">
                      Kêu gọi hành động
                    </p>
                    <p className="text-sm font-semibold text-white">{result.cta}</p>
                  </div>
                )}

                {result.hashtags.length > 0 && (
                  <p className="text-xs text-white/80">{result.hashtags.join(' ')}</p>
                )}

                {titleOptions.length > 0 && (
                  <ul className="space-y-1 border-t border-white/20 pt-3 text-sm text-white">
                    <li className="font-medium text-white">Tiêu đề gợi ý:</li>
                    {titleOptions.map((t, i) => (
                      <li
                        key={i}
                        className="cursor-pointer text-white/80 hover:text-orange-400"
                        onClick={() => setResult({ ...result, title: t })}
                      >
                        • {t}
                      </li>
                    ))}
                  </ul>
                )}

                {result.suggested_ads_angle && (
                  <p className="border-t border-white/20 pt-2 text-xs text-white/85">
                    Góc quảng cáo: {result.suggested_ads_angle}
                  </p>
                )}
                </div>
              </div>

              {/* Phân tích 16 bước */}
              {result.analysis_16_steps.length > 0 && (
                <div className="rounded-xl border border-white/20 bg-[#0A3D30] p-4 text-white md:p-5">
                  <h4 className="mb-3 font-semibold text-white">Phân tích khung 16 bước</h4>
                  <div className="space-y-2">
                    {(analysisExpanded
                      ? result.analysis_16_steps
                      : result.analysis_16_steps.slice(0, 5)
                    ).map((step) => (
                      <div key={step.step} className="rounded-lg bg-white/10 px-3 py-2 text-sm">
                        <span className="font-medium text-orange-300">Bước {step.step}:</span>{' '}
                        <span className="text-white/85">{step.label}</span>
                        <p className="mt-0.5 text-white">{step.summary}</p>
                      </div>
                    ))}
                  </div>
                  {result.analysis_16_steps.length > 5 ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="mt-3 w-full text-white hover:bg-white/10 hover:text-[#F97316]"
                      onClick={() => setAnalysisExpanded((v) => !v)}
                    >
                      {analysisExpanded
                        ? 'Thu gọn'
                        : `Xem chi tiết (${result.analysis_16_steps.length} bước)`}
                    </Button>
                  ) : null}
                </div>
              )}

              {result.suggested_images.length > 0 && (
                <div className="rounded-xl border border-white/20 bg-[#0A3D30] p-4 text-sm text-white">
                  <p className="mb-2 font-medium text-white">Gợi ý hình ảnh</p>
                  <ul className="list-disc space-y-1 pl-4 text-white/85">
                    {result.suggested_images.map((img, i) => (
                      <li key={i}>{img}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {errorMsg && <ErrorState message={errorMsg} onRetry={() => setErrorMsg('')} />}

      <ContentPreviewDialog
        open={contentPreviewOpen}
        onOpenChange={setContentPreviewOpen}
        title={result?.title || form.productService}
        category="Viết bài nâng cao"
        content={
          result
            ? variantTab === 'main' || variantTab === 'facebook'
              ? buildFacebookPostText({
                  hook: result.hook,
                  body:
                    variantTab === 'main' ? result.final_article : result.variants.facebook,
                  cta: result.cta,
                  hashtags: result.hashtags,
                })
              : displayContent()
            : ''
        }
        onContentChange={handlePreviewContentChange}
      />
    </div>
  );
}
