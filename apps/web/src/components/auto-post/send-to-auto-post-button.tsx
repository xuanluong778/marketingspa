'use client';

import { useRouter } from 'next/navigation';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  buildLiveAiPayload,
  sendToAutoPost,
} from '@/lib/auto-post-ai-marketing-bridge';
import type { ContentStudioTab } from '@/types/content-marketing';

export function SendToAutoPostButton({
  tab,
  title,
  content,
  contentScore,
  disabled,
  size = 'sm',
  variant = 'outline',
  className,
}: {
  tab: ContentStudioTab;
  title: string;
  content: string;
  contentScore?: number;
  disabled?: boolean;
  size?: 'sm' | 'default' | 'lg';
  variant?: 'outline' | 'secondary' | 'default' | 'ghost';
  className?: string;
}) {
  const router = useRouter();

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      className={className}
      disabled={disabled || !content.trim()}
      onClick={() =>
        sendToAutoPost(
          router,
          buildLiveAiPayload(tab, title, content, contentScore),
        )
      }
    >
      <Send className="mr-1 h-4 w-4" />
      Gửi Auto Post
    </Button>
  );
}
