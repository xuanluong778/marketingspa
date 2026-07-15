'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Copy,
  FileText,
  Loader2,
  RefreshCw,
  Save,
  Sparkles,
  Target,
  Wand2,
} from 'lucide-react';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorState } from '@/components/shared/page-state';
import { useCurrentUser } from '@/hooks/use-auth';
import {
  useContentMarketingMutations,
  useContentMarketingStatus,
} from '@/hooks/use-content-marketing';
import {
  createHistoryId,
  defaultAdvancedFormState,
  loadAdvancedDraft,
  sampleAdvancedFormState,
  saveAdvancedDraft,
  saveContentHistoryItem,
} from '@/lib/content-marketing-form';
import { formatMutationError } from '@/lib/format-mutation-error';
import { PresetOrCustomField } from '@/components/content-marketing/preset-or-custom-field';
import { AdvancedArticleContent } from '@/components/content-marketing/advanced-article-content';
import { SendToAutoPostButton } from '@/components/auto-post/send-to-auto-post-button';
import { ContentGeneratingLoader } from '@/components/content-marketing/content-generating-loader';
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
  const { data: user } = useCurrentUser();
  const { data: aiStatus } = useContentMarketingStatus();
  const {
    generateAdvanced,
    rewriteAdvanced,
    optimizeAdvancedCta,
    generateAdvancedTitles,
    suggestAdvancedField,
  } = useContentMarketingMutations();

  const [suggestingField, setSuggestingField] = useState<AdvancedSuggestField | null>(null);

  const [form, setForm] = useState<AdvancedFormState>(defaultAdvancedFormState);
  const [result, setResult] = useState<AdvancedArticleResult | null>(null);
  const [variantTab, setVariantTab] = useState<VariantTab>('main');
  const [titleOptions, setTitleOptions] = useState<string[]>([]);
  const [copyMsg, setCopyMsg] = useState('');
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const patch = useCallback((p: Partial<AdvancedFormState>) => {
    setForm((prev) => {
      const next = { ...prev, ...p };
      saveAdvancedDraft(next, user?.id);
      return next;
    });
  }, [user?.id]);

  useEffect(() => {
    const draft = loadAdvancedDraft(user?.id);
    if (draft) setForm(draft);
  }, [user?.id]);

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
    setResult(null);
    if (!form.productService.trim() || !form.painPoints.trim()) {
      setErrorMsg('Vui lòng nhập tên dịch vụ và nỗi đau khách hàng.');
      return;
    }
    try {
      const data = await generateAdvanced.mutateAsync(form);
      setResult(data);
      setVariantTab('main');
      setTitleOptions([]);
    } catch (e) {
      setErrorMsg(formatMutationError(e));
    }
  };

  const handleRewrite = async () => {
    setErrorMsg('');
    try {
      const data = await rewriteAdvanced.mutateAsync({
        ...form,
        previousArticle: result?.final_article,
      });
      setResult(data);
    } catch (e) {
      setErrorMsg(formatMutationError(e));
    }
  };

  const handleOptimizeCta = async () => {
    if (!result) return;
    setErrorMsg('');
    try {
      const data = await optimizeAdvancedCta.mutateAsync({
        finalArticle: result.final_article,
        ctaType: form.ctaType,
        productService: form.productService,
        articleGoal: form.articleGoal,
      });
      setResult({
        ...result,
        cta: data.cta,
        final_article: data.updated_article,
        variants: {
          ...result.variants,
          facebook: data.updated_article,
        },
      });
    } catch (e) {
      setErrorMsg(formatMutationError(e));
    }
  };

  const handleTitles = async () => {
    if (!result) return;
    setErrorMsg('');
    try {
      const data = await generateAdvancedTitles.mutateAsync({
        finalArticle: result.final_article,
        productService: form.productService,
        demographic: form.demographic,
      });
      setTitleOptions(data.titles);
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
    setCopyMsg('Đã copy bài đăng Facebook!');
    setTimeout(() => setCopyMsg(''), 2000);
  };

  const handleSaveHistory = () => {
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

  const busy =
    generateAdvanced.isPending ||
    rewriteAdvanced.isPending ||
    optimizeAdvancedCta.isPending ||
    generateAdvancedTitles.isPending;

  return (
    <div className="advanced-write-tab space-y-4">
      {!aiStatus?.aiConfigured && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          AI chưa cấu hình — hệ thống dùng bản mẫu. Thêm OPENAI_API_KEY vào .env để bật AI.
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-white/40 bg-[#0A3D30] text-white hover:bg-[#083028] hover:text-[#F97316] [&_svg]:text-white"
          onClick={() => setForm(sampleAdvancedFormState)}
        >
          Điền mẫu
        </Button>
        {copyMsg && <span className="self-center text-sm text-emerald-300">{copyMsg}</span>}
      </div>

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

          <div className="space-y-1.5">
            <Label className="text-white">Combo / ưu đãi</Label>
            <Input value={form.combo} onChange={(e) => patch({ combo: e.target.value })} placeholder="Mua 8 tặng 2 buổi" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-white">Quà tặng</Label>
            <Input value={form.gift} onChange={(e) => patch({ gift: e.target.value })} placeholder="Serum mini, voucher..." />
          </div>

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

          <div className="flex flex-wrap gap-2 pt-2">
            <Button onClick={handleGenerate} disabled={busy}>
              {generateAdvanced.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Tạo bài viết
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-white/40 bg-[#0A3D30] text-white hover:bg-[#083028] hover:text-[#F97316] [&_svg]:text-white hover:[&_svg]:text-[#F97316]"
              onClick={handleSaveHistory}
              disabled={!result || busy}
            >
              <Save className="mr-2 h-4 w-4" />
              {saved ? 'Đã lưu!' : 'Lưu bài viết'}
            </Button>
          </div>
        </div>

        {/* Cột phải — kết quả */}
        <div className="space-y-4 min-h-[320px]">
          {generateAdvanced.isPending && (
            <ContentGeneratingLoader
              title="Đang tạo bài viết"
              subtitle="AI đang viết bài theo khung 16 bước — vui lòng đợi trong giây lát"
            />
          )}

          {!result && !generateAdvanced.isPending && !busy && (
            <EmptyState title="Chưa có bài viết" description="Điền form và bấm Tạo bài viết" />
          )}

          {result && !generateAdvanced.isPending && (
            <>
              <div className="rounded-xl border bg-card p-4 md:p-5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-2 w-full">
                    <h3 className="font-bold text-lg leading-snug text-slate-900">{result.title}</h3>
                    {result.hook && variantTab !== 'main' && (
                      <blockquote className="border-l-4 border-primary/60 bg-primary/5 px-4 py-2.5 text-sm italic text-slate-700 rounded-r-md">
                        {result.hook}
                      </blockquote>
                    )}
                    <Badge variant="secondary">{result.source === 'ai' ? 'AI' : 'Mẫu'}</Badge>
                  </div>
                </div>

                <Tabs value={variantTab} onValueChange={(v) => setVariantTab(v as VariantTab)}>
                  <TabsList className="flex flex-wrap h-auto">
                    <TabsTrigger value="main">Bài chính</TabsTrigger>
                    <TabsTrigger value="facebook">Facebook</TabsTrigger>
                    <TabsTrigger value="website">Website</TabsTrigger>
                    <TabsTrigger value="ads">Quảng cáo</TabsTrigger>
                  </TabsList>
                </Tabs>

                <div className="rounded-lg border border-slate-200 bg-white p-4 md:p-5 max-h-[min(560px,70vh)] overflow-y-auto shadow-inner">
                  {variantTab === 'main' || variantTab === 'facebook' ? (
                    <div className="space-y-4">
                      {variantTab === 'main' && result.hook && (
                        <p className="text-[15px] leading-[1.85] text-slate-800 whitespace-pre-wrap font-medium">
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
                  <p className="text-xs text-muted-foreground">
                    Bài viết liền mạch — sẵn sàng copy đăng Facebook
                  </p>
                )}

                {result.cta && (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-primary mb-1">
                      Kêu gọi hành động
                    </p>
                    <p className="text-sm font-semibold text-slate-900">{result.cta}</p>
                  </div>
                )}

                {result.hashtags.length > 0 && (
                  <p className="text-xs text-muted-foreground">{result.hashtags.join(' ')}</p>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={handleRewrite} disabled={busy}>
                    <RefreshCw className="mr-1 h-3.5 w-3.5" /> Viết lại
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleOptimizeCta} disabled={busy}>
                    <Target className="mr-1 h-3.5 w-3.5" /> Tối ưu CTA
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleTitles} disabled={busy}>
                    <Wand2 className="mr-1 h-3.5 w-3.5" /> Tạo tiêu đề khác
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleCopy}>
                    <Copy className="mr-1 h-3.5 w-3.5" /> Copy đăng Facebook
                  </Button>
                  <SendToAutoPostButton
                    tab="advanced"
                    title={result.title || form.productService}
                    content={displayContent()}
                    variant="outline"
                    className="h-8 border-white/40 bg-[#0A3D30] text-white hover:bg-[#083028] hover:text-[#F97316] [&_svg]:text-white"
                  />
                  <Button variant="outline" size="sm" onClick={handleSaveHistory}>
                    <Save className="mr-1 h-3.5 w-3.5" /> {saved ? 'Đã lưu!' : 'Lưu bài viết'}
                  </Button>
                </div>

                {titleOptions.length > 0 && (
                  <ul className="text-sm space-y-1 border-t pt-3">
                    <li className="font-medium">Tiêu đề gợi ý:</li>
                    {titleOptions.map((t, i) => (
                      <li key={i} className="text-muted-foreground cursor-pointer hover:text-foreground" onClick={() => setResult({ ...result, title: t })}>
                        • {t}
                      </li>
                    ))}
                  </ul>
                )}

                {result.suggested_ads_angle && (
                  <p className="text-xs text-muted-foreground border-t pt-2">
                    Góc quảng cáo: {result.suggested_ads_angle}
                  </p>
                )}
              </div>

              {/* Phân tích 16 bước */}
              {result.analysis_16_steps.length > 0 && (
                <div className="rounded-xl border bg-card p-4 md:p-5">
                  <h4 className="font-semibold mb-3">Phân tích khung 16 bước</h4>
                  <div className="space-y-2 max-h-[360px] overflow-y-auto">
                    {result.analysis_16_steps.map((step) => (
                      <div key={step.step} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                        <span className="font-medium text-primary">Bước {step.step}:</span>{' '}
                        <span className="text-slate-600">{step.label}</span>
                        <p className="text-slate-700 mt-0.5">{step.summary}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.suggested_images.length > 0 && (
                <div className="rounded-xl border p-4 text-sm">
                  <p className="font-medium mb-2">Gợi ý hình ảnh</p>
                  <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
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
    </div>
  );
}
