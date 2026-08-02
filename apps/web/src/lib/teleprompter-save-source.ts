/**
 * Lưu kịch bản đã chỉnh về bài gốc (history local + API snapshot).
 */
import { apiClient } from '@/lib/api-client';
import { loadContentHistory, upsertContentHistoryItem } from '@/lib/content-marketing-form';
import type { TeleprompterDraft } from '@/lib/teleprompter-storage';

function isLocalHistoryId(id: string): boolean {
  return /^\d+-/.test(id);
}

export async function saveTeleprompterScriptToSource(
  draft: TeleprompterDraft,
  userId?: string | null,
): Promise<{ ok: boolean; message: string }> {
  const script = draft.editedScript?.trim();
  if (!script) {
    return { ok: false, message: 'Kịch bản trống.' };
  }

  let historyId = draft.sourceContentId;
  if (historyId && !isLocalHistoryId(historyId)) {
    try {
      const api = await apiClient<{ clientContentId?: string; sourceContentId?: string }>(
        `/content-marketing/teleprompter-source/${encodeURIComponent(historyId)}`,
      );
      historyId = api.clientContentId || api.sourceContentId || historyId;
    } catch {
      /* continue with uuid — may still upsert API only */
    }
  }

  let historyUpdated = false;
  if (historyId && isLocalHistoryId(historyId)) {
    const item = loadContentHistory(userId).find((h) => h.id === historyId);
    if (item) {
      upsertContentHistoryItem(
        {
          ...item,
          videoScript: script,
          videoHook: draft.videoHook || item.videoHook,
        },
        userId,
      );
      historyUpdated = true;
    }
  }

  try {
    await apiClient('/content-marketing/teleprompter-source', {
      method: 'POST',
      body: JSON.stringify({
        id: isLocalHistoryId(draft.sourceContentId || '') ? undefined : draft.sourceContentId,
        clientContentId: historyId && isLocalHistoryId(historyId) ? historyId : undefined,
        sourceContentId: historyId,
        sourceType: draft.sourceType || 'saved',
        sourceRoute: draft.sourceRoute,
        sourceTitle: draft.sourceTitle || draft.title,
        originalScript: draft.originalScript,
        editedScript: script,
        videoHook: draft.videoHook,
        facebookPost: draft.facebookPost,
        estimatedDuration: draft.estimatedDuration,
      }),
    });
  } catch {
    if (!historyUpdated) {
      return { ok: false, message: 'Không lưu được — thử lại hoặc lưu bản nháp cục bộ.' };
    }
  }

  return {
    ok: true,
    message: historyUpdated
      ? 'Đã cập nhật kịch bản vào bài gốc trong thư viện.'
      : 'Đã lưu snapshot kịch bản trên hệ thống.',
  };
}
