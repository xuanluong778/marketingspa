import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type {
  AdCtaSuggestion,
  AdInsightsSuggestion,
  PersonalIdeasSuggestion,
  AdvancedArticleResult,
  AdvancedFieldSuggestion,
  AdvancedFormState,
  ContentFormState,
  ContentScoreResult,
  ContentStudioTab,
  GenerateContentResult,
  GeneratePersonalResult,
  PersonalFormState,
  PersonalRewriteMode,
  PersonalScoreResult,
  PolicyCheckResult,
  RewriteMode,
  VideoAnalysisResult,
} from '@/types/content-marketing';

const BASE = '/content-marketing';

function formToPayload(form: ContentFormState, mode: ContentStudioTab) {
  return {
    mode,
    productService: form.productService,
    targetAudience: form.targetAudience || undefined,
    painPoints: form.painPoints || undefined,
    benefits: form.benefits || undefined,
    offer: form.offer || undefined,
    adObjective: form.adObjective || undefined,
    platform: form.platform,
    cta: form.cta || undefined,
    tone: form.tone,
    adContentType: form.adContentType,
    personalPostType: form.personalPostType,
    videoUrl: form.videoUrl || undefined,
    transcript: form.transcript || undefined,
  };
}

function personalFormToPayload(form: PersonalFormState) {
  return {
    mode: 'personal' as const,
    productService: form.postTopic,
    postTopic: form.postTopic,
    targetAudience: form.targetAudience || undefined,
    postGoal: form.postGoal,
    personalPostType: form.personalPostType,
    personalTone: form.personalTone,
    brandArticleGenre: form.brandArticleGenre,
    brandPronoun: form.brandPronoun,
    brandVoiceIntensity: form.brandVoiceIntensity,
    postLength: form.postLength,
    personalAngle: form.personalAngle || undefined,
    storyIdea: form.storyIdea || undefined,
    videoUrl: form.videoUrl || undefined,
    transcript: form.transcript || undefined,
  };
}

export function useContentMarketingStatus() {
  return useQuery({
    queryKey: ['content-marketing', 'status'],
    queryFn: () => apiClient<{ aiConfigured: boolean; model: string }>(`${BASE}/status`),
  });
}

function advancedFormToPayload(form: AdvancedFormState) {
  return { ...form };
}

export function useContentMarketingMutations() {
  const generate = useMutation({
    mutationFn: ({ form, mode }: { form: ContentFormState; mode: ContentStudioTab }) =>
      apiClient<GenerateContentResult>(`${BASE}/generate`, {
        method: 'POST',
        body: JSON.stringify(formToPayload(form, mode)),
      }),
  });

  const generatePersonal = useMutation({
    mutationFn: (form: PersonalFormState) =>
      apiClient<GeneratePersonalResult>(`${BASE}/generate`, {
        method: 'POST',
        body: JSON.stringify(personalFormToPayload(form)),
      }),
  });

  const analyzeVideo = useMutation({
    mutationFn: (body: { videoUrl?: string; transcript?: string }) =>
      apiClient<VideoAnalysisResult>(`${BASE}/analyze-video`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });

  const checkPolicy = useMutation({
    mutationFn: (body: { content: string; platform?: string }) =>
      apiClient<PolicyCheckResult>(`${BASE}/check-policy`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });

  const score = useMutation({
    mutationFn: (body: {
      content: string;
      platform?: string;
      mode?: ContentStudioTab;
      adObjective?: string;
    }) =>
      apiClient<ContentScoreResult & { policy: PolicyCheckResult }>(`${BASE}/score`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });

  const rewrite = useMutation({
    mutationFn: (body: { content: string; mode: RewriteMode; platform?: string; tone?: string }) =>
      apiClient<{ variants: string[]; mode: string }>(`${BASE}/rewrite`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });

  const scorePersonal = useMutation({
    mutationFn: (body: { content: string }) =>
      apiClient<PersonalScoreResult>(`${BASE}/score`, {
        method: 'POST',
        body: JSON.stringify({ ...body, mode: 'personal' }),
      }),
  });

  const rewritePersonal = useMutation({
    mutationFn: (body: { content: string; mode: PersonalRewriteMode; personalTone?: string }) =>
      apiClient<{ variants: string[]; mode: string }>(`${BASE}/rewrite`, {
        method: 'POST',
        body: JSON.stringify({ ...body, studioMode: 'personal' }),
      }),
  });

  const suggestInsights = useMutation({
    mutationFn: (body: {
      productService: string;
      targetAudience?: string;
      platform?: string;
      adObjective?: string;
    }) =>
      apiClient<AdInsightsSuggestion>(`${BASE}/suggest-insights`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });

  const suggestCta = useMutation({
    mutationFn: (body: {
      productService: string;
      targetAudience?: string;
      platform?: string;
      offer?: string;
      adObjective?: string;
      adContentType?: string;
    }) =>
      apiClient<AdCtaSuggestion>(`${BASE}/suggest-cta`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });

  const suggestPersonalIdeas = useMutation({
    mutationFn: (body: {
      postTopic: string;
      targetAudience?: string;
      postGoal?: string;
      personalPostType?: string;
      personalTone?: string;
    }) =>
      apiClient<PersonalIdeasSuggestion>(`${BASE}/suggest-personal-ideas`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });

  const generateAdvanced = useMutation({
    mutationFn: (form: AdvancedFormState) =>
      apiClient<AdvancedArticleResult>(`${BASE}/generate-advanced`, {
        method: 'POST',
        body: JSON.stringify(advancedFormToPayload(form)),
      }),
  });

  const rewriteAdvanced = useMutation({
    mutationFn: (body: AdvancedFormState & { previousArticle?: string }) =>
      apiClient<AdvancedArticleResult>(`${BASE}/advanced/rewrite`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });

  const optimizeAdvancedCta = useMutation({
    mutationFn: (body: {
      finalArticle: string;
      ctaType: string;
      productService?: string;
      articleGoal?: string;
    }) =>
      apiClient<{ cta: string; alternatives: string[]; updated_article: string }>(
        `${BASE}/advanced/optimize-cta`,
        { method: 'POST', body: JSON.stringify(body) },
      ),
  });

  const generateAdvancedTitles = useMutation({
    mutationFn: (body: { finalArticle: string; productService?: string; demographic?: string }) =>
      apiClient<{ titles: string[] }>(`${BASE}/advanced/titles`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });

  const suggestAdvancedField = useMutation({
    mutationFn: (body: {
      field: string;
      productService: string;
      demographic?: string;
      articleGoal?: string;
      writingStyle?: string;
      painPoints?: string;
      currentValue?: string;
    }) =>
      apiClient<AdvancedFieldSuggestion>(
        `${BASE}/advanced/suggest-field`,
        { method: 'POST', body: JSON.stringify(body) },
      ),
  });

  return {
    generate,
    generatePersonal,
    generateAdvanced,
    rewriteAdvanced,
    optimizeAdvancedCta,
    generateAdvancedTitles,
    suggestAdvancedField,
    analyzeVideo,
    checkPolicy,
    score,
    scorePersonal,
    rewrite,
    rewritePersonal,
    suggestInsights,
    suggestCta,
    suggestPersonalIdeas,
  };
}
