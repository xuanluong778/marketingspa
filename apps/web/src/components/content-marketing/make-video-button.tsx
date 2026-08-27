'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api-client';
import {
  buildTeleprompterHandoff,
  navigateToTeleprompter,
  type TeleprompterSourceType,
} from '@/lib/teleprompter-bridge';
import { useT } from '@/i18n/i18n-provider';

export type MakeVideoButtonProps = {
  title?: string;
  videoScript?: string | null;
  content?: string | null;
  facebookPost?: string | null;
  videoHook?: string | null;
  sourceType: TeleprompterSourceType;
  sourceRoute?: string | null;
  sourceContentId?: string | null;
  originalScript?: string | null;
  editedScript?: string | null;
  /** Persist handoff snapshot to API when true or when sourceContentId is set. */
  persistToApi?: boolean;
  className?: string;
  size?: 'sm' | 'default' | 'lg';
  variant?: 'outline' | 'secondary' | 'default' | 'ghost';
  disabled?: boolean;
  label?: string;
};

/**
 * “Làm video” — handoff nội dung sang /teleprompter (logic cũ: teleprompter-bridge).
 */
export function MakeVideoButton({
  title,
  videoScript,
  content,
  facebookPost,
  videoHook,
  sourceType,
  sourceRoute,
  sourceContentId,
  originalScript,
  editedScript,
  persistToApi = false,
  className,
  size = 'sm',
  variant = 'outline',
  disabled,
  label = 'Làm video',
}: MakeVideoButtonProps) {
  const t = useT();
  const router = useRouter();
  const [opening, setOpening] = useState(false);

  const handleClick = useCallback(async () => {
    let contentId: string | undefined;
    const handoff = buildTeleprompterHandoff({
      title,
      videoScript,
      content,
      facebookPost,
      videoHook,
      sourceType,
      sourceContentId,
      sourceRoute,
      originalScript,
      editedScript,
    });
    if (!handoff) {
      window.alert(t('content.noContentForVideo'));
      return;
    }

    setOpening(true);
    if (persistToApi || sourceContentId?.trim()) {
      try {
        const saved = await apiClient<{ id?: string; contentId?: string }>(
          '/content-marketing/teleprompter-source',
          {
            method: 'POST',
            body: JSON.stringify({
              clientContentId: sourceContentId || undefined,
              sourceContentId: sourceContentId || undefined,
              sourceType: handoff.sourceType,
              sourceRoute: handoff.sourceRoute,
              sourceTitle: handoff.sourceTitle,
              originalScript: handoff.originalScript,
              editedScript: handoff.editedScript,
              videoHook: handoff.videoHook,
              facebookPost: handoff.facebookPost,
              estimatedDuration: handoff.estimatedDuration,
            }),
          },
        );
        contentId = saved.id || saved.contentId;
        if (contentId) handoff.sourceContentId = contentId;
      } catch {
        /* continue with local handoff */
      }
    }
    navigateToTeleprompter(router, handoff, { contentId });
    setOpening(false);
  }, [
    title,
    videoScript,
    content,
    facebookPost,
    videoHook,
    sourceType,
    sourceRoute,
    sourceContentId,
    originalScript,
    editedScript,
    persistToApi,
    router,
  ]);

  const hasContent = !!(
    (videoScript || '').trim() ||
    (editedScript || '').trim() ||
    (facebookPost || '').trim() ||
    (content || '').trim()
  );

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      className={cn(className)}
      disabled={disabled || opening || !hasContent}
      onClick={() => void handleClick()}
    >
      <Video className="mr-1 h-3.5 w-3.5" />
      {opening ? 'Đang mở…' : label}
    </Button>
  );
}

export default MakeVideoButton;
