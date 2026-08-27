'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { enUS, vi as viLocale } from 'date-fns/locale';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useChatbotUnreadSummary, useMarkChatbotConversationRead } from '@/hooks/use-chatbot-cskh';
import { ChatbotVisitorAvatar } from '@/components/chatbot-cskh/chatbot-visitor-avatar';
import { cn } from '@/lib/utils';
import { useI18n, useT } from '@/i18n/i18n-provider';

function formatUnreadBadge(count: number): string {
  if (count <= 0) return '';
  if (count > 99) return '99+';
  return String(count);
}

/**
 * Icon tin nhắn + badge unread trên header.
 * Chỉ mở dropdown khi bấm icon — không auto-open khi có tin mới.
 */
export function MessagesHeaderIcon({
  className,
  tone = 'dark',
}: {
  className?: string;
  /** dark = topbar xanh; light = sidebar/surface sáng */
  tone?: 'dark' | 'light';
}) {
  const t = useT();
  const { locale } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const unreadQ = useChatbotUnreadSummary(12);
  const markRead = useMarkChatbotConversationRead();

  const unreadCount = unreadQ.data?.unreadCount ?? 0;
  const badge = formatUnreadBadge(unreadCount);
  const items = unreadQ.data?.items ?? [];

  const emptyHint = useMemo(() => {
    if (unreadQ.isLoading) return t('layout.loadingShort');
    if (unreadQ.isError) return t('layout.loadMessagesFailed');
    return t('layout.noUnread');
  }, [unreadQ.isError, unreadQ.isLoading, t]);

  const triggerClass =
    tone === 'dark'
      ? 'border border-white/25 bg-white/10 text-white hover:bg-white/20 hover:!text-white'
      : 'border border-border bg-background text-foreground hover:bg-muted';

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void unreadQ.refetch();
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
            triggerClass,
            className,
          )}
          aria-label={t('layout.messages')}
        >
          <MessageCircle className="h-5 w-5 shrink-0" strokeWidth={2.25} aria-hidden />
          {badge ? (
            <span
              className="pointer-events-none absolute -right-1 -top-1 z-10 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white shadow-sm ring-2 ring-[#0A3D30]"
              aria-hidden
            >
              {badge}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-[min(100vw-1.5rem,22rem)] p-0"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <p className="text-sm font-semibold">{t('layout.messages')}</p>
          {unreadCount > 0 ? (
            <span className="text-xs text-muted-foreground">{unreadCount}</span>
          ) : null}
        </div>

        <div className="max-h-[min(60vh,22rem)] overflow-y-auto py-1">
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyHint}</p>
          ) : (
            items.map((item) => (
              <DropdownMenuItem
                key={item.conversationId}
                className="cursor-pointer gap-2 rounded-none px-3 py-2.5 focus:bg-accent"
                onSelect={(e) => {
                  e.preventDefault();
                  setOpen(false);
                  void markRead.mutateAsync(item.conversationId).catch(() => undefined);
                  router.push(
                    `/messages?conversationId=${encodeURIComponent(item.conversationId)}`,
                  );
                }}
              >
                <ChatbotVisitorAvatar
                  name={item.visitorName}
                  src={item.visitorAvatarUrl}
                  size={36}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">
                      {item.visitorName || t('layout.guest')}
                    </p>
                    <span className="ml-auto shrink-0 rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">
                      {item.unreadMessageCount > 1 ? item.unreadMessageCount : '•'}
                    </span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{item.preview || '…'}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {item.pageName || (item.channel === 'facebook' ? 'Messenger' : item.channel)}
                    {' · '}
                    {formatDistanceToNow(new Date(item.lastMessageAt), {
                      addSuffix: true,
                      locale: locale === 'en' ? enUS : viLocale,
                    })}
                  </p>
                </div>
              </DropdownMenuItem>
            ))
          )}
        </div>

        <DropdownMenuSeparator className="my-0" />
        <DropdownMenuItem
          className="cursor-pointer justify-center rounded-none py-2.5 text-sm font-medium text-primary focus:text-primary"
          onSelect={(e) => {
            e.preventDefault();
            setOpen(false);
            router.push('/messages');
          }}
        >
          {t('layout.messages')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
