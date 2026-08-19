'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import type { ChatbotBot } from '@/types/chatbot-cskh';

export type InboxChannelFilter = 'all' | 'facebook' | 'website';

export type InboxFanpageOption = {
  pageId: string;
  pageName: string | null;
  botId: string;
  botName?: string;
  status?: string;
};

export type InboxWebsiteOption = {
  domain: string;
  botId: string;
  botName?: string;
};

export interface ChatbotInboxFiltersProps {
  bots: ChatbotBot[];
  botId: string | null;
  onBotIdChange: (botId: string | null) => void;
  channel: InboxChannelFilter;
  onChannelChange: (channel: InboxChannelFilter) => void;
  channelId: string | null;
  onChannelIdChange: (channelId: string | null) => void;
  fanpages?: InboxFanpageOption[];
  websites?: InboxWebsiteOption[];
  unreadByBot?: Record<string, number>;
}

/**
 * [Chọn Project ▼] [Tất cả | Fanpage | Website] [Chọn Fanpage/Website ▼]
 * Dropdown Fanpage/Website hiện TẤT CẢ kênh org; chọn kênh khác Project → tự đổi Project.
 */
export function ChatbotInboxFilters({
  bots,
  botId,
  onBotIdChange,
  channel,
  onChannelChange,
  channelId,
  onChannelIdChange,
  fanpages = [],
  websites = [],
  unreadByBot = {},
}: ChatbotInboxFiltersProps) {
  const fanpageValue = channelId
    ? (() => {
        const hit = fanpages.find((p) => p.pageId === channelId);
        return hit ? `${hit.botId}::${hit.pageId}` : `__all__`;
      })()
    : '__all__';

  const websiteValue = channelId
    ? (() => {
        const hit =
          websites.find((w) => w.domain === channelId && w.botId === botId) ||
          websites.find((w) => w.domain === channelId);
        return hit ? `${hit.botId}::${hit.domain}` : '__all__';
      })()
    : '__all__';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={botId || ''}
        onValueChange={(v) => {
          onBotIdChange(v || null);
          onChannelIdChange(null);
        }}
      >
        <SelectTrigger className="w-[220px]">
          <SelectValue placeholder="Chọn Project / Bot" />
        </SelectTrigger>
        <SelectContent>
          {bots.map((b) => {
            const n = unreadByBot[b.id] || 0;
            return (
              <SelectItem key={b.id} value={b.id}>
                {b.botName || b.businessName || b.id.slice(0, 8)}
                {n > 0 ? ` (${n})` : ''}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      <div className="flex rounded-md border p-0.5">
        {(
          [
            ['all', 'Tất cả'],
            ['facebook', 'Fanpage'],
            ['website', 'Website'],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            type="button"
            size="sm"
            variant={channel === key ? 'default' : 'ghost'}
            className="h-8 px-3"
            disabled={!botId}
            onClick={() => {
              onChannelChange(key);
              onChannelIdChange(null);
            }}
          >
            {label}
          </Button>
        ))}
      </div>

      {channel === 'facebook' && (
        <Select
          value={fanpageValue}
          onValueChange={(v) => {
            if (v === '__all__') {
              onChannelIdChange(null);
              return;
            }
            const [nextBotId, pageId] = v.split('::');
            if (nextBotId && nextBotId !== botId) onBotIdChange(nextBotId);
            onChannelIdChange(pageId || null);
          }}
          disabled={!botId}
        >
          <SelectTrigger className="min-w-[260px] w-[min(100%,320px)]">
            <SelectValue placeholder="Chọn Fanpage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Tất cả Fanpage (Project này)</SelectItem>
            {fanpages.map((p) => (
              <SelectItem key={`${p.botId}::${p.pageId}`} value={`${p.botId}::${p.pageId}`}>
                {p.pageName || p.pageId}
                {p.botName ? ` · ${p.botName}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {channel === 'website' && (
        <Select
          value={websiteValue}
          onValueChange={(v) => {
            if (v === '__all__') {
              onChannelIdChange(null);
              return;
            }
            const [nextBotId, domain] = v.split('::');
            if (nextBotId && nextBotId !== botId) onBotIdChange(nextBotId);
            onChannelIdChange(domain || null);
          }}
          disabled={!botId}
        >
          <SelectTrigger className="min-w-[260px] w-[min(100%,320px)]">
            <SelectValue placeholder="Chọn Website" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Tất cả Website (Project này)</SelectItem>
            {websites.length === 0 ? (
              <SelectItem value="__empty__" disabled>
                Chưa có website nào được gắn
              </SelectItem>
            ) : (
              websites.map((w) => (
                <SelectItem key={`${w.botId}::${w.domain}`} value={`${w.botId}::${w.domain}`}>
                  {w.domain}
                  {w.botName ? ` · ${w.botName}` : ''}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
