/**
 * Lịch sử phiên Teleprompter — localStorage theo user.
 */
import type { TeleprompterDraft } from '@/lib/teleprompter-storage';
import { DEFAULT_TELEPROMPTER_DRAFT } from '@/lib/teleprompter-storage';

export type TeleprompterSession = {
  id: string;
  title: string;
  sourceType?: string;
  sourceRoute?: string;
  sourceTitle?: string;
  sourceContentId?: string;
  originalScript: string;
  editedScript: string;
  facebookPost?: string;
  videoHook?: string;
  /** Full teleprompter config snapshot */
  config: Pick<
    TeleprompterDraft,
    | 'fontSize'
    | 'scrollSpeed'
    | 'lineHeight'
    | 'contentWidth'
    | 'mirrorMode'
    | 'theme'
    | 'countdown'
    | 'lastPosition'
    | 'estimatedDuration'
  >;
  updatedAt: string;
};

const SESSIONS_KEY = 'ms_teleprompter_sessions_v1';
const MAX_SESSIONS = 20;

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function sessionsKey(userId?: string | null): string {
  return userId ? `${SESSIONS_KEY}:${userId}` : SESSIONS_KEY;
}

export function loadTeleprompterSessions(userId?: string | null): TeleprompterSession[] {
  const s = storage();
  if (!s) return [];
  try {
    const raw = s.getItem(sessionsKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TeleprompterSession[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x.id === 'string')
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  } catch {
    return [];
  }
}

export function saveTeleprompterSessions(
  sessions: TeleprompterSession[],
  userId?: string | null,
): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(sessionsKey(userId), JSON.stringify(sessions.slice(0, MAX_SESSIONS)));
  } catch {
    /* quota */
  }
}

export function upsertTeleprompterSession(
  session: TeleprompterSession,
  userId?: string | null,
): void {
  const prev = loadTeleprompterSessions(userId).filter((x) => x.id !== session.id);
  saveTeleprompterSessions([session, ...prev], userId);
}

export function deleteTeleprompterSession(id: string, userId?: string | null): void {
  const next = loadTeleprompterSessions(userId).filter((x) => x.id !== id);
  saveTeleprompterSessions(next, userId);
}

export function renameTeleprompterSession(
  id: string,
  title: string,
  userId?: string | null,
): void {
  const sessions = loadTeleprompterSessions(userId);
  const idx = sessions.findIndex((x) => x.id === id);
  if (idx < 0) return;
  sessions[idx] = { ...sessions[idx]!, title: title.trim() || sessions[idx]!.title, updatedAt: new Date().toISOString() };
  saveTeleprompterSessions(sessions, userId);
}

export function createSessionId(): string {
  return `tp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function draftToSession(draft: TeleprompterDraft, sessionId?: string): TeleprompterSession {
  return {
    id: sessionId || draft.sessionId || createSessionId(),
    title: draft.title || draft.sourceTitle || 'Kịch bản quay video',
    sourceType: draft.sourceType,
    sourceRoute: draft.sourceRoute,
    sourceTitle: draft.sourceTitle,
    sourceContentId: draft.sourceContentId,
    originalScript: draft.originalScript,
    editedScript: draft.editedScript,
    facebookPost: draft.facebookPost,
    videoHook: draft.videoHook,
    config: {
      fontSize: draft.fontSize,
      scrollSpeed: draft.scrollSpeed,
      lineHeight: draft.lineHeight,
      contentWidth: draft.contentWidth,
      mirrorMode: draft.mirrorMode,
      theme: draft.theme,
      countdown: draft.countdown,
      lastPosition: draft.lastPosition,
      estimatedDuration: draft.estimatedDuration,
    },
    updatedAt: new Date().toISOString(),
  };
}

export function sessionToDraft(
  session: TeleprompterSession,
  base?: TeleprompterDraft | null,
): TeleprompterDraft {
  const b = base || DEFAULT_TELEPROMPTER_DRAFT;
  return {
    ...b,
    sessionId: session.id,
    title: session.title,
    originalScript: session.originalScript,
    editedScript: session.editedScript,
    sourceType: session.sourceType,
    sourceRoute: session.sourceRoute,
    sourceTitle: session.sourceTitle,
    sourceContentId: session.sourceContentId,
    facebookPost: session.facebookPost,
    videoHook: session.videoHook,
    fontSize: session.config.fontSize,
    scrollSpeed: session.config.scrollSpeed,
    lineHeight: session.config.lineHeight,
    contentWidth: session.config.contentWidth,
    mirrorMode: session.config.mirrorMode,
    theme: session.config.theme,
    countdown: session.config.countdown,
    lastPosition: session.config.lastPosition,
    estimatedDuration: session.config.estimatedDuration,
    updatedAt: session.updatedAt,
  };
}
