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
import { useT } from '@/i18n/i18n-provider';

export type InboxChannelFilter = 'all' | 'facebook' | 'zalo' | 'website';

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

export type InboxZaloOaOption = {
  accountRef: string;
  oaName: string | null;
  botId: string;
  botName?: string;
  status?: string;
  avatarUrl?: string | null;
  connectionId?: string;
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
  oas?: InboxZaloOaOption[];
  unreadByBot?: Record<string, number>;
}

/**
 * [Chọn Project ▼] [Tất cả | Fanpage | Zalo | Website] [Chọn Fanpage/OA/Website ▼]
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
  oas = [],
  unreadByBot = {},
}: ChatbotInboxFiltersProps) {
  const t = useT();
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

  const oaValue = channelId
    ? (() => {
        const hit =
          oas.find((o) => o.accountRef === channelId && o.botId === botId) ||
          oas.find((o) => o.accountRef === channelId);
        return hit ? `${hit.botId}::${hit.accountRef}` : `__all__`;
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
        <SelectTrigger className="w-full min-w-0 sm:w-[220px]">
          <SelectValue placeholder={t('chatbot.selectProjectBot')} />
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

      <div className="flex max-w-full flex-wrap rounded-md border p-0.5">
        {(
          [
            ['all', t('chatbot.all')],
            ['facebook', 'Fanpage'],
            ['zalo', 'Zalo'],
            ['website', 'Website'],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            type="button"
            size="sm"
            variant={channel === key ? 'default' : 'ghost'}
            className="h-10 min-w-[4.5rem] px-3 sm:h-8"
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
          <SelectTrigger className="w-full min-w-0 sm:w-[min(100%,320px)]">
            <SelectValue placeholder={t('chatbot.selectFanpage')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t('chatbot.allFanpages')}</SelectItem>
            {fanpages.map((p) => (
              <SelectItem key={`${p.botId}::${p.pageId}`} value={`${p.botId}::${p.pageId}`}>
                {p.pageName || p.pageId}
                {p.botName ? ` · ${p.botName}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {channel === 'zalo' && (
        <Select
          value={oaValue}
          onValueChange={(v) => {
            if (v === '__all__') {
              onChannelIdChange(null);
              return;
            }
            const [nextBotId, accountRef] = v.split('::');
            if (nextBotId && nextBotId !== botId) onBotIdChange(nextBotId);
            onChannelIdChange(accountRef || null);
          }}
          disabled={!botId}
        >
          <SelectTrigger className="w-full min-w-0 sm:w-[min(100%,320px)]">
            <SelectValue placeholder={t('chatbot.selectZaloOa')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t('chatbot.allZaloOas')}</SelectItem>
            {(() => {
              const projectOas = botId ? oas.filter((o) => o.botId === botId) : oas;
              const displayOas = projectOas.length > 0 ? projectOas : oas;
              if (displayOas.length === 0) {
                return (
                  <SelectItem value="__empty__" disabled>
                    Chưa kết nối Zalo OA — vào Zalo Marketing để OAuth OA
                  </SelectItem>
                );
              }
              return displayOas.map((o) => (
                <SelectItem
                  key={`${o.botId}::${o.accountRef}`}
                  value={`${o.botId}::${o.accountRef}`}
                >
                  {o.oaName || o.accountRef}
                  {o.botName ? ` · ${o.botName}` : ''}
                  {botId && o.botId !== botId ? t('chatbot.switchProject') : ''}
                </SelectItem>
              ));
            })()}
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
          <SelectTrigger className="w-full min-w-0 sm:w-[min(100%,320px)]">
            <SelectValue placeholder={t('chatbot.selectWebsite')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t('chatbot.allWebsites')}</SelectItem>
            {websites.length === 0 ? (
              <SelectItem value="__empty__" disabled>
                {t('chatbot.noWebsiteAttached')}
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
