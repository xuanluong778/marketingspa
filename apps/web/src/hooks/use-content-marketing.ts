import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient, apiUpload } from '@/lib/api-client';
import type {
  AdCtaSuggestion,
  AdInsightsSuggestion,
  PersonalIdeasSuggestion,
  PersonalTitlesSuggestion,
  AdvancedArticleResult,
  AdvancedFieldSuggestion,
  AdvancedFormState,
  ContentFormState,
  ContentScoreResult,
  ContentStudioTab,
  FacebookPolicyCheckPayload,
  FacebookPolicyCheckResult,
  FacebookPolicyImportResult,
  FacebookPolicyMediaAnalysis,
  FacebookPolicyRewriteResult,
  FacebookPolicyUrlKind,
  GenerateContentResult,
  GeneratePersonalResult,
  OpinionAnalyzeResult,
  OpinionGenerateResult,
  OpinionNaturalnessResult,
  OpinionRewriteMode,
  OpinionStoryAnalysis,
  OpinionVoiceProfileResponse,
  PersonalFormState,
  PersonalRewriteMode,
  PersonalScoreResult,
  PolicyCheckResult,
  RewriteMode,
  TeleprompterScriptRewriteMode,
  TeleprompterScriptRewriteResult,
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
    industryId: form.industryId || undefined,
    industryName: form.industryName || undefined,
    customIndustry: form.customIndustry || undefined,
  };
}

function personalFormToPayload(form: PersonalFormState) {
  const opinionTopic =
    form.opinionSummary.trim() ||
    form.opinionDebateIssue.trim() ||
    form.opinionThesis.trim() ||
    form.postTopic.trim() ||
    'Góc nhìn & chính kiến';

  if (form.creationMode === 'opinion') {
    return {
      mode: 'personal' as const,
      creationMode: 'opinion' as const,
      productService: opinionTopic.slice(0, 500),
      postTopic: opinionTopic.slice(0, 500),
      postGoal: form.postGoal,
      personalPostType: form.personalPostType,
      personalTone: form.personalTone,
      personalAngle: form.opinionThesis || form.personalAngle || undefined,
      storyIdea: form.opinionSummary || undefined,
      transcript: form.opinionSourceText || form.transcript || undefined,
      videoUrl: form.opinionSourceUrl || form.videoUrl || undefined,
      opinionSourceUrl: form.opinionSourceUrl || undefined,
      opinionSourceText: form.opinionSourceText || undefined,
      opinionSummary: form.opinionSummary || undefined,
      opinionDebateIssue: form.opinionDebateIssue || undefined,
      opinionStance: form.opinionStance,
      opinionStanceCustom: form.opinionStanceCustom || undefined,
      opinionAngle: form.opinionAngle,
      opinionPronoun: form.opinionPronoun,
      opinionIntensity: form.opinionIntensity,
      opinionLength: form.opinionLength,
      opinionThesis: form.opinionThesis || undefined,
    };
  }

  return {
    mode: 'personal' as const,
    creationMode: 'topic' as const,
    productService: form.postTopic,
    postTopic: form.postTopic,
    topicGroupId: form.topicGroupId || undefined,
    topicGroupLabel: form.topicGroupLabel || undefined,
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

type IndustryBody = {
  industryId?: string;
  industryName?: string;
  customIndustry?: string;
};

  const checkPolicy = useMutation({
    mutationFn: (body: { content: string; platform?: string } & IndustryBody) =>
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
    } & IndustryBody) =>
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
    } & IndustryBody) =>
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
    } & IndustryBody) =>
      apiClient<AdCtaSuggestion>(`${BASE}/suggest-cta`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });

  const suggestPersonalIdeas = useMutation({
    mutationFn: (body: {
      postTopic: string;
      topicGroupId?: string;
      topicGroupLabel?: string;
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

  const suggestPersonalTitles = useMutation({
    mutationFn: (body: {
      topicGroupId?: string;
      topicGroupLabel?: string;
      subtopicId?: string;
      subtopicLabel: string;
      count: 5 | 10 | 20;
      tone?: string;
      pronoun?: string;
      audience?: string;
      goal?: string;
    }) =>
      apiClient<PersonalTitlesSuggestion>(`${BASE}/suggest-personal-titles`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });

  const analyzeOpinionStory = useMutation({
    mutationFn: async (body: {
      sourceUrl?: string;
      sourceText?: string;
      transcript?: string;
    }) => {
      // Prefer structured opinion/analyze; map to legacy OpinionStoryAnalysis for existing form.
      try {
        const res = await apiClient<OpinionAnalyzeResult>(`${BASE}/opinion/analyze`, {
          method: 'POST',
          body: JSON.stringify({
            sourceUrl: body.sourceUrl,
            sourceText: body.sourceText,
            transcript: body.transcript,
          }),
        });
        return {
          summary: res.sourceSummary || '',
          debateIssue: res.mainControversy || '',
          suggestedAngles: res.suggestedAngles || [],
          keyPoints: [...(res.confirmedFacts || []), ...(res.unverifiedClaims || [])].slice(
            0,
            8,
          ),
          source: (res.analysisSource === 'ai' ? 'ai' : 'template') as 'ai' | 'template',
          _full: res,
        } satisfies OpinionStoryAnalysis & { _full?: OpinionAnalyzeResult };
      } catch {
        return apiClient<OpinionStoryAnalysis>(`${BASE}/analyze-opinion-story`, {
          method: 'POST',
          body: JSON.stringify({
            sourceUrl: body.sourceUrl,
            sourceText: body.sourceText,
          }),
        });
      }
    },
  });

  const generateOpinion = useMutation({
    mutationFn: (body: {
      sourceSummary?: string;
      confirmedFacts?: string[];
      unverifiedClaims?: string[];
      selectedAngle?: string;
      angle?: string;
      userViewpoint?: string;
      pronoun?: string;
      intensity?: string;
      length?: string;
      commonPhrases?: string[];
      hideNames?: boolean;
      preferredWords?: string[];
      avoidWords?: string[];
      openingPhrases?: string[];
      closingPhrases?: string[];
      sampleParagraph?: string;
      themeId?: string;
      subtopic?: string;
      quickAngleLabel?: string;
    }) =>
      apiClient<OpinionGenerateResult>(`${BASE}/opinion/generate`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });

  const rewriteOpinion = useMutation({
    mutationFn: (body: {
      rewriteMode: OpinionRewriteMode;
      sourceSummary?: string;
      confirmedFacts?: string[];
      unverifiedClaims?: string[];
      selectedAngle?: string;
      angle?: string;
      userViewpoint?: string;
      pronoun?: string;
      intensity?: string;
      length?: string;
      commonPhrases?: string[];
      hideNames?: boolean;
      preferredWords?: string[];
      avoidWords?: string[];
      openingPhrases?: string[];
      closingPhrases?: string[];
      sampleParagraph?: string;
      themeId?: string;
      subtopic?: string;
      quickAngleLabel?: string;
      facebookPost?: string;
      videoScript?: string;
      videoHook?: string;
    }) =>
      apiClient<OpinionGenerateResult>(`${BASE}/opinion/rewrite`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });

  const scoreOpinionNaturalness = useMutation({
    mutationFn: (body: {
      content: string;
      contentType?: 'facebook_post' | 'video_script';
    }) =>
      apiClient<OpinionNaturalnessResult>(`${BASE}/opinion/score-naturalness`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });

  const suggestOpinionField = useMutation({
    mutationFn: (body: {
      field: 'summary' | 'debateIssue';
      themeId?: string;
      themeLabel?: string;
      subtopic?: string;
      sourceText?: string;
      currentSummary?: string;
      currentDebateIssue?: string;
      currentValue?: string;
    }) =>
      apiClient<{ options: string[]; source: 'ai' | 'template' }>(
        `${BASE}/opinion/suggest-field`,
        { method: 'POST', body: JSON.stringify(body) },
      ),
  });

  const getOpinionVoiceProfile = useMutation({
    mutationFn: () =>
      apiClient<OpinionVoiceProfileResponse>(`${BASE}/opinion/voice-profile`, {
        method: 'GET',
      }),
  });

  const saveOpinionVoiceProfile = useMutation({
    mutationFn: (body: {
      scope?: 'user' | 'organization';
      pronoun?: string;
      preferredWords?: string[];
      avoidWords?: string[];
      openingPhrases?: string[];
      closingPhrases?: string[];
      sampleParagraph?: string;
    }) =>
      apiClient(`${BASE}/opinion/voice-profile`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
  });

  const checkFacebookPolicy = useMutation({
    mutationFn: (body: FacebookPolicyCheckPayload) =>
      apiClient<FacebookPolicyCheckResult>(`${BASE}/facebook-policy/check`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });

  const rewriteFacebookPolicy = useMutation({
    mutationFn: (body: FacebookPolicyCheckPayload) =>
      apiClient<FacebookPolicyRewriteResult>(`${BASE}/facebook-policy/rewrite`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });

  const importFacebookPolicyUrl = useMutation({
    mutationFn: (body: {
      url: string;
      urlKind?: FacebookPolicyUrlKind;
      fanpageId?: string;
    }) =>
      apiClient<FacebookPolicyImportResult>(`${BASE}/facebook-policy/import-url`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });

  const analyzeFacebookPolicyMedia = useMutation({
    mutationFn: (body: {
      mediaType?: 'image' | 'video' | 'transcript';
      caption?: string;
      transcript?: string;
      file?: File | null;
      thumbnail?: File | null;
    }) => {
      const fd = new FormData();
      if (body.mediaType) fd.append('mediaType', body.mediaType);
      if (body.caption) fd.append('caption', body.caption);
      if (body.transcript) fd.append('transcript', body.transcript);
      if (body.file) fd.append('file', body.file);
      if (body.thumbnail) fd.append('thumbnail', body.thumbnail);
      return apiUpload<FacebookPolicyMediaAnalysis>(
        `${BASE}/facebook-policy/analyze-media`,
        fd,
      );
    },
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
    } & IndustryBody) =>
      apiClient<{ cta: string; alternatives: string[]; updated_article: string }>(
        `${BASE}/advanced/optimize-cta`,
        { method: 'POST', body: JSON.stringify(body) },
      ),
  });

  const generateAdvancedTitles = useMutation({
    mutationFn: (
      body: { finalArticle: string; productService?: string; demographic?: string } & IndustryBody,
    ) =>
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
    } & IndustryBody) =>
      apiClient<AdvancedFieldSuggestion>(
        `${BASE}/advanced/suggest-field`,
        { method: 'POST', body: JSON.stringify(body) },
      ),
  });

  const rewriteTeleprompterScript = useMutation({
    mutationFn: (body: { script: string; mode: TeleprompterScriptRewriteMode; title?: string }) =>
      apiClient<TeleprompterScriptRewriteResult>(`${BASE}/teleprompter/rewrite`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
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
    suggestPersonalTitles,
    analyzeOpinionStory,
    generateOpinion,
    rewriteOpinion,
    scoreOpinionNaturalness,
    getOpinionVoiceProfile,
    saveOpinionVoiceProfile,
    suggestOpinionField,
    checkFacebookPolicy,
    rewriteFacebookPolicy,
    importFacebookPolicyUrl,
    analyzeFacebookPolicyMedia,
    rewriteTeleprompterScript,
  };
}
