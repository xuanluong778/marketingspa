'use client';

import { useEffect, useMemo, useState, type UIEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/page-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ChatbotVisitorAvatar } from '@/components/chatbot-cskh/chatbot-visitor-avatar';
import {
  ChatbotInboxFilters,
  type InboxChannelFilter,
} from '@/components/chatbot-cskh/chatbot-inbox-filters';
import {
  useChatbotBots,
  useChatbotConversation,
  useChatbotInbox,
  useChatbotInboxChannelOptions,
  useChatbotTakeover,
  useChatbotUnreadSummary,
  useMarkChatbotConversationRead,
} from '@/hooks/use-chatbot-cskh';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

function InboxRowSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="space-y-2 p-1">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-start gap-2 rounded-lg border p-3">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-40 max-w-full" />
            <Skeleton className="h-3 w-28 max-w-full" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function MessagesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const conversationId = searchParams.get('conversationId');
  const bots = useChatbotBots();
  const [botId, setBotId] = useState<string | null>(null);
  const [channel, setChannel] = useState<InboxChannelFilter>('all');
  const [channelId, setChannelId] = useState<string | null>(null);

  useEffect(() => {
    if (!botId && bots.data?.[0]?.id) setBotId(bots.data[0].id);
  }, [bots.data, botId]);

  const inbox = useChatbotInbox({ botId, channel, channelId });
  const channelOptions = useChatbotInboxChannelOptions(botId);
  const unreadSummary = useChatbotUnreadSummary(15, { botId });
  const conversation = useChatbotConversation(conversationId);
  const markRead = useMarkChatbotConversationRead();
  const takeover = useChatbotTakeover();

  useEffect(() => {
    if (!conversationId) return;
    markRead.mutate(conversationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const sorted = useMemo(() => {
    const rows = inbox.data?.pages.flatMap((p) => p.items) ?? [];
    return [...rows].sort((a, b) => {
      const ua = a.isUnread || (a.unreadMessageCount ?? 0) > 0 ? 1 : 0;
      const ub = b.isUnread || (b.unreadMessageCount ?? 0) > 0 ? 1 : 0;
      if (ua !== ub) return ub - ua;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [inbox.data]);

  const selectConversation = (id: string) => {
    router.replace(`/messages?conversationId=${encodeURIComponent(id)}`);
  };

  const onListScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight > 80) return;
    if (inbox.hasNextPage && !inbox.isFetchingNextPage) {
      void inbox.fetchNextPage();
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tin nhắn"
        description="Hộp thư theo Project / Bot — Fanpage và Website không trộn lẫn"
      />

      <ChatbotInboxFilters
        bots={bots.data || []}
        botId={botId}
        onBotIdChange={(id) => {
          setBotId(id);
          router.replace('/messages');
        }}
        channel={channel}
        onChannelChange={(ch) => {
          setChannel(ch);
          router.replace('/messages');
        }}
        channelId={channelId}
        onChannelIdChange={(id) => {
          setChannelId(id);
          router.replace('/messages');
        }}
        fanpages={channelOptions.data?.fanpages}
        websites={channelOptions.data?.websites}
        unreadByBot={unreadSummary.data?.unreadByBot}
      />

      {inbox.isError && <ErrorState onRetry={() => void inbox.refetch()} />}

      {!botId ? (
        <EmptyState
          title="Chọn Project / Bot"
          description="Mỗi Project chỉ hiện hội thoại Fanpage/Website thuộc Project đó."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
          <div
            onScroll={onListScroll}
            className="max-h-[min(70vh,720px)] space-y-2 overflow-y-auto rounded-lg border bg-card p-2"
          >
            {inbox.isLoading ? (
              <InboxRowSkeleton />
            ) : sorted.length === 0 ? (
              <EmptyState
                title="Chưa có hội thoại"
                description="Khi khách nhắn qua Messenger hoặc widget của Project này, tin sẽ hiện ở đây."
              />
            ) : (
              <>
                {sorted.map((c) => {
                  const name =
                    c.customer?.name ||
                    c.visitorName ||
                    (c.customer?.psid || c.externalUserId
                      ? `PSID …${(c.customer?.psid || c.externalUserId || '').slice(-4)}`
                      : 'Khách');
                  const unread = c.isUnread || (c.unreadMessageCount ?? 0) > 0;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => selectConversation(c.id)}
                      className={cn(
                        'flex w-full items-start gap-2 rounded-lg border p-3 text-left transition-colors',
                        conversationId === c.id
                          ? 'border-primary bg-primary/5'
                          : 'hover:bg-muted/50',
                      )}
                    >
                      <ChatbotVisitorAvatar
                        name={name}
                        src={c.customer?.avatarUrl || c.visitorAvatarUrl}
                        size={40}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate font-medium">{name}</p>
                          {unread ? (
                            <span className="shrink-0 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                              {c.unreadMessageCount || '!'}
                            </span>
                          ) : null}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {c.fanpage?.pageName ||
                            (c.channel === 'facebook'
                              ? 'Messenger'
                              : c.channelRef || c.channel)}
                          {' · '}
                          {formatDateTime(c.updatedAt)}
                        </p>
                        <p className="mt-1 line-clamp-1 text-sm">{c.messages?.[0]?.message}</p>
                      </div>
                    </button>
                  );
                })}
                {inbox.isFetchingNextPage && <InboxRowSkeleton count={2} />}
              </>
            )}
          </div>

          <div className="flex min-h-[320px] flex-col rounded-lg border bg-card">
            {!conversationId && (
              <p className="p-4 text-sm text-muted-foreground">Chọn hội thoại để xem chi tiết</p>
            )}
            {conversationId && conversation.isLoading && (
              <div className="space-y-3 p-4">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-2/3" />
              </div>
            )}
            {conversationId && conversation.isError && (
              <div className="p-4">
                <ErrorState onRetry={() => void conversation.refetch()} />
              </div>
            )}
            {conversationId && conversation.data && (
              <>
                <div className="flex items-center justify-between gap-2 border-b p-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <ChatbotVisitorAvatar
                      name={
                        conversation.data.customer?.name ||
                        conversation.data.visitorName ||
                        'Khách'
                      }
                      src={
                        conversation.data.customer?.avatarUrl ||
                        conversation.data.visitorAvatarUrl
                      }
                      size={32}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {conversation.data.customer?.name ||
                          conversation.data.visitorName ||
                          'Khách'}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {conversation.data.fanpage?.pageName ||
                          conversation.data.channelRef ||
                          conversation.data.channel}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {conversation.data.humanTakeover ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={takeover.isPending}
                        onClick={() =>
                          takeover.mutate({ id: conversationId, resumeBot: true })
                        }
                      >
                        Bật lại AI
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={takeover.isPending}
                        onClick={() =>
                          takeover.mutate({ id: conversationId, resumeBot: false })
                        }
                      >
                        Tiếp quản
                      </Button>
                    )}
                  </div>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto p-4">
                  {conversation.data.messages?.map((m) => {
                    const inbound = m.direction === 'INBOUND' || m.role === 'user';
                    const failed = m.status === 'FAILED';
                    const label = failed
                      ? 'Hệ thống'
                      : inbound
                        ? 'Khách'
                        : m.senderType === 'BOT' || m.role === 'assistant'
                          ? 'Bot'
                          : m.role;
                    return (
                      <div
                        key={m.id}
                        className={cn('flex', inbound ? 'justify-end' : 'justify-start')}
                      >
                        <div
                          className={cn(
                            'max-w-[85%] rounded-2xl px-3 py-2 text-sm',
                            failed
                              ? 'border border-destructive/40 bg-destructive/10 text-destructive'
                              : inbound
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted text-foreground',
                          )}
                        >
                          <p className="mb-0.5 text-[10px] opacity-70">{label}</p>
                          <p className="whitespace-pre-wrap break-words">{m.message}</p>
                          <p className="mt-1 text-[10px] opacity-60">
                            {failed
                              ? `Chưa gửi Messenger${m.errorCode ? ` · ${m.errorCode}` : ''}`
                              : m.status === 'SENT'
                                ? 'Đã gửi Messenger'
                                : formatDateTime(m.createdAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
