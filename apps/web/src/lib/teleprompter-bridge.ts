/**
 * Handoff “Làm video” → /teleprompter
 * - sessionStorage (primary) + localStorage (fallback / reload)
 * - Không đưa nội dung dài vào URL (chỉ optional contentId)
 */

import { estimateDurationSeconds } from './teleprompter-storage';

export type TeleprompterSourceType =
  | 'opinion'
  | 'personal_brand'
  | 'ad'
  | 'advanced'
  | 'ai_result'
  | 'draft'
  | 'history'
  | 'saved'
  | 'manual';

export type TeleprompterPayload = {
  title: string;
  videoScript: string;
  videoHook?: string;
  facebookPost?: string;
  /** @deprecated use editedScript / originalScript */
  sourceType?: TeleprompterSourceType;
  sourceContentId?: string;
  sourceRoute?: string;
  sourceTitle?: string;
  originalScript?: string;
  editedScript?: string;
  estimatedDuration?: number;
};

export type TeleprompterHandoff = {
  sourceType: TeleprompterSourceType;
  sourceContentId?: string;
  sourceRoute?: string;
  sourceTitle: string;
  originalScript: string;
  editedScript: string;
  videoHook?: string;
  facebookPost?: string;
  estimatedDuration: number;
  savedAt: string;
};

const SESSION_KEY = 'ms_teleprompter_from_opinion';
const LOCAL_KEY = 'ms_teleprompter_handoff_v1';

function sessionStore(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function localStore(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function pickScript(input: {
  videoScript?: string | null;
  content?: string | null;
  facebookPost?: string | null;
  editedScript?: string | null;
}): string {
  const candidates = [
    input.videoScript,
    input.editedScript,
    input.facebookPost,
    input.content,
  ];
  for (const c of candidates) {
    const t = (c || '').trim();
    if (t) return t;
  }
  return '';
}

export function buildTeleprompterHandoff(input: {
  title?: string;
  videoScript?: string | null;
  content?: string | null;
  facebookPost?: string | null;
  videoHook?: string | null;
  sourceType: TeleprompterSourceType;
  sourceContentId?: string | null;
  sourceRoute?: string | null;
  originalScript?: string | null;
  editedScript?: string | null;
}): TeleprompterHandoff | null {
  const script = pickScript(input);
  if (!script) return null;
  const title = (input.title || input.sourceType || 'Kịch bản quay video').trim();
  const original = (input.originalScript || script).trim();
  const edited = (input.editedScript || script).trim();
  return {
    sourceType: input.sourceType,
    sourceContentId: input.sourceContentId?.trim() || undefined,
    sourceRoute: input.sourceRoute?.trim() || undefined,
    sourceTitle: title,
    originalScript: original,
    editedScript: edited,
    videoHook: input.videoHook?.trim() || undefined,
    facebookPost: input.facebookPost?.trim() || undefined,
    estimatedDuration: estimateDurationSeconds(edited),
    savedAt: new Date().toISOString(),
  };
}

function handoffToLegacyPayload(h: TeleprompterHandoff): TeleprompterPayload {
  return {
    title: h.sourceTitle,
    videoScript: h.editedScript,
    videoHook: h.videoHook,
    facebookPost: h.facebookPost,
    sourceType: h.sourceType,
    sourceContentId: h.sourceContentId,
    sourceRoute: h.sourceRoute,
    sourceTitle: h.sourceTitle,
    originalScript: h.originalScript,
    editedScript: h.editedScript,
    estimatedDuration: h.estimatedDuration,
  };
}

function parseHandoff(raw: string): TeleprompterHandoff | null {
  try {
    const parsed = JSON.parse(raw) as Partial<TeleprompterHandoff> & TeleprompterPayload;
    // New shape
    if (parsed.editedScript?.trim() || parsed.originalScript?.trim()) {
      const edited = (parsed.editedScript || parsed.originalScript || parsed.videoScript || '').trim();
      if (!edited) return null;
      return {
        sourceType: (parsed.sourceType as TeleprompterSourceType) || 'manual',
        sourceContentId: parsed.sourceContentId,
        sourceRoute: parsed.sourceRoute,
        sourceTitle: (parsed.sourceTitle || parsed.title || 'Kịch bản').trim(),
        originalScript: (parsed.originalScript || edited).trim(),
        editedScript: edited,
        videoHook: parsed.videoHook,
        facebookPost: parsed.facebookPost,
        estimatedDuration:
          Number(parsed.estimatedDuration) > 0
            ? Number(parsed.estimatedDuration)
            : estimateDurationSeconds(edited),
        savedAt: parsed.savedAt || new Date().toISOString(),
      };
    }
    // Legacy payload
    if (parsed.videoScript?.trim()) {
      const edited = parsed.videoScript.trim();
      return {
        sourceType: (parsed.sourceType as TeleprompterSourceType) || 'manual',
        sourceContentId: parsed.sourceContentId,
        sourceRoute: parsed.sourceRoute,
        sourceTitle: (parsed.title || 'Kịch bản').trim(),
        originalScript: (parsed.originalScript || edited).trim(),
        editedScript: (parsed.editedScript || edited).trim(),
        videoHook: parsed.videoHook,
        facebookPost: parsed.facebookPost,
        estimatedDuration: estimateDurationSeconds(edited),
        savedAt: new Date().toISOString(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** @deprecated prefer saveTeleprompterHandoff */
export function savePendingTeleprompter(payload: TeleprompterPayload): void {
  const h = buildTeleprompterHandoff({
    title: payload.title,
    videoScript: payload.videoScript || payload.editedScript,
    facebookPost: payload.facebookPost,
    videoHook: payload.videoHook,
    sourceType: payload.sourceType || 'manual',
    sourceContentId: payload.sourceContentId,
    sourceRoute: payload.sourceRoute,
    originalScript: payload.originalScript || payload.videoScript,
    editedScript: payload.editedScript || payload.videoScript,
  });
  if (h) saveTeleprompterHandoff(h);
}

export function saveTeleprompterHandoff(handoff: TeleprompterHandoff): void {
  const json = JSON.stringify(handoff);
  const legacy = JSON.stringify(handoffToLegacyPayload(handoff));
  const ss = sessionStore();
  const ls = localStore();
  try {
    ss?.setItem(SESSION_KEY, legacy);
    ss?.setItem(LOCAL_KEY, json);
  } catch {
    /* ignore */
  }
  try {
    ls?.setItem(LOCAL_KEY, json);
    ls?.setItem(SESSION_KEY, legacy);
  } catch {
    /* ignore */
  }
}

export function loadTeleprompterHandoff(): TeleprompterHandoff | null {
  const ss = sessionStore();
  const ls = localStore();
  const keys = [LOCAL_KEY, SESSION_KEY];
  for (const store of [ss, ls]) {
    if (!store) continue;
    for (const key of keys) {
      try {
        const raw = store.getItem(key);
        if (!raw) continue;
        const h = parseHandoff(raw);
        if (h?.editedScript?.trim()) return h;
      } catch {
        /* continue */
      }
    }
  }
  return null;
}

/** @deprecated prefer loadTeleprompterHandoff */
export function loadPendingTeleprompter(): TeleprompterPayload | null {
  const h = loadTeleprompterHandoff();
  if (!h) return null;
  return handoffToLegacyPayload(h);
}

export function clearPendingTeleprompter(): void {
  const ss = sessionStore();
  const ls = localStore();
  try {
    ss?.removeItem(SESSION_KEY);
    ss?.removeItem(LOCAL_KEY);
  } catch {
    /* ignore */
  }
  try {
    ls?.removeItem(SESSION_KEY);
    ls?.removeItem(LOCAL_KEY);
  } catch {
    /* ignore */
  }
}

export function clearTeleprompterHandoff(): void {
  clearPendingTeleprompter();
}

/**
 * Lưu handoff + điều hướng /teleprompter.
 * contentId chỉ đưa vào query nếu có (không đưa script).
 */
export function navigateToTeleprompter(
  router: { push: (href: string) => void },
  handoff: TeleprompterHandoff,
  options?: { contentId?: string },
): void {
  saveTeleprompterHandoff(handoff);
  const id = options?.contentId || handoff.sourceContentId;
  if (id) {
    router.push(`/teleprompter?contentId=${encodeURIComponent(id)}`);
  } else {
    router.push('/teleprompter');
  }
}

export function makeVideoFromFields(
  router: { push: (href: string) => void },
  input: Parameters<typeof buildTeleprompterHandoff>[0],
  options?: { contentId?: string },
): boolean {
  const h = buildTeleprompterHandoff(input);
  if (!h) return false;
  navigateToTeleprompter(router, h, options);
  return true;
}
