'use client';

import { useEffect, useMemo, useRef, useState, type ElementType, type UIEvent } from 'react';
import {
  Bot,
  Globe,
  MessageSquare,
  Plus,
  Trash2,
  Users,
  Zap,
  Facebook,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { LoadingState, EmptyState, ErrorState } from '@/components/shared/page-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useChatbotOverview,
  useChatbotBots,
  useChatbotKnowledge,
  useChatbotChannels,
  useChatbotInbox,
  useChatbotInboxChannelOptions,
  useChatbotUnreadSummary,
  useChatbotLeads,
  useChatbotSettings,
  useChatbotOpenAiStatus,
  useChatbotFacebookPages,
  useChatbotFacebookWebhookStatus,
  useCreateChatbotBot,
  useUpdateChatbotBot,
  useDeleteChatbotBot,
  useChatbotEmbed,
  useCreateKnowledge,
  useDeleteKnowledge,
  useCreateChannel,
  useDeleteChannel,
  useUpdateChatbotSettings,
  useConnectFacebookPage,
  useDisconnectFacebookPage,
  useSyncChatbotFacebookFromAutoPost,
  useChatbotTakeover,
  useChatbotConversation,
  useMarkChatbotConversationRead,
} from '@/hooks/use-chatbot-cskh';
import { CHANNEL_LABELS, SOURCE_TYPE_LABELS, type ChatbotBot } from '@/types/chatbot-cskh';
import { formatDateTime } from '@/lib/format';
import { copyToClipboard } from '@/lib/copy-to-clipboard';
import Link from 'next/link';
import { BotFormPanel } from '@/components/chatbot-cskh/bot-form-panel';
import { ChatbotEmbedList } from '@/components/chatbot-cskh/chatbot-embed-list';
import { ChatbotVisitorAvatar } from '@/components/chatbot-cskh/chatbot-visitor-avatar';
import {
  ChatbotInboxFilters,
  type InboxChannelFilter,
} from '@/components/chatbot-cskh/chatbot-inbox-filters';
import { useAutoPostStatus } from '@/hooks/use-auto-post';

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  icon: ElementType;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function InboxListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border p-3">
          <div className="flex items-start gap-2">
            <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3 max-w-[180px]" />
              <Skeleton className="h-3 w-1/2 max-w-[140px]" />
              <Skeleton className="h-3 w-full" />
            </div>
            <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ConversationDetailSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 border-b pb-2">
        <Skeleton className="h-8 w-8 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-48" />
        </div>
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
          <Skeleton className={`h-10 rounded-lg ${i % 2 === 0 ? 'w-2/3' : 'w-1/2'}`} />
        </div>
      ))}
    </div>
  );
}


export default function ChatbotCskhPage() {
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [inboxId, setInboxId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('bots');
  const [botForm, setBotForm] = useState<Partial<ChatbotBot> | null>(null);
  const [kbForm, setKbForm] = useState({ title: '', content: '', sourceType: 'FAQ' });
  const [fbForm, setFbForm] = useState({ pageName: '', pageId: '', pageAccessToken: '' });
  const [settingsForm, setSettingsForm] = useState<{
    model?: string;
    temperature?: number;
    systemPrompt?: string;
    monthlyLimit?: number;
  } | null>(null);
  const [testOpenAi, setTestOpenAi] = useState(false);
  const [inboxChannel, setInboxChannel] = useState<InboxChannelFilter>('all');
  const [inboxChannelId, setInboxChannelId] = useState<string | null>(null);
  const inboxScrollRef = useRef<HTMLDivElement | null>(null);

  const overview = useChatbotOverview();
  const bots = useChatbotBots();
  const knowledge = useChatbotKnowledge(selectedBotId ?? undefined);
  const { data: autoPostStatus } = useAutoPostStatus();
  const canPastePageToken = Boolean(autoPostStatus?.canUseServerEnv);
  const channels = useChatbotChannels();
  const inbox = useChatbotInbox({
    enabled: activeTab === 'inbox',
    botId: selectedBotId,
    channel: inboxChannel,
    channelId: inboxChannelId,
  });
  const channelOptions = useChatbotInboxChannelOptions(selectedBotId);
  const unreadSummary = useChatbotUnreadSummary(15, {
    botId: activeTab === 'inbox' ? selectedBotId : null,
  });
  const conversation = useChatbotConversation(inboxId);
  const markRead = useMarkChatbotConversationRead();
  const leads = useChatbotLeads();
  const settings = useChatbotSettings();
  const openAiStatus = useChatbotOpenAiStatus(testOpenAi);
  const facebook = useChatbotFacebookPages();
  const fbWebhook = useChatbotFacebookWebhookStatus();
  const embed = useChatbotEmbed(selectedBotId);

  const createBot = useCreateChatbotBot();
  const updateBot = useUpdateChatbotBot();
  const deleteBot = useDeleteChatbotBot();
  const createKb = useCreateKnowledge();
  const deleteKb = useDeleteKnowledge();
  const createChannel = useCreateChannel();
  const deleteChannel = useDeleteChannel();
  const updateSettings = useUpdateChatbotSettings();
  const connectFb = useConnectFacebookPage();
  const disconnectFb = useDisconnectFacebookPage();
  const syncFbFromAutoPost = useSyncChatbotFacebookFromAutoPost();
  const takeover = useChatbotTakeover();

  const inboxItems = useMemo(
    () => inbox.data?.pages.flatMap((p) => p.items) ?? [],
    [inbox.data],
  );

  useEffect(() => {
    if (!selectedBotId && bots.data?.[0]?.id) {
      setSelectedBotId(bots.data[0].id);
    }
  }, [bots.data, selectedBotId]);

  useEffect(() => {
    if (!inboxId) return;
    markRead.mutate(inboxId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inboxId]);

  const activeBot = useMemo(
    () => bots.data?.find((b) => b.id === selectedBotId) ?? bots.data?.[0],
    [bots.data, selectedBotId],
  );

  const botId = activeBot?.id ?? null;

  const onInboxScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight > 80) return;
    if (inbox.hasNextPage && !inbox.isFetchingNextPage) {
      void inbox.fetchNextPage();
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chatbot CSKH"
        description="Tạo chatbot tư vấn khách, quản lý kiến thức và gắn lên website hoặc Facebook"
      />

      {overview.isLoading && <LoadingState />}
      {overview.isError && <ErrorState onRetry={overview.refetch} />}

      {overview.data && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Chatbot đang chạy" value={overview.data.botsActive} icon={Bot} />
          <StatCard
            label="Hội thoại"
            value={overview.data.conversationsTotal}
            icon={MessageSquare}
          />
          <StatCard label="Khách tiềm năng hôm nay" value={overview.data.leadsToday} icon={Users} />
          <StatCard
            label="Câu trả lời AI còn lại"
            value={`${overview.data.repliesRemaining}/${overview.data.monthlyReplyLimit}`}
            icon={Zap}
          />
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="bots">Chatbot</TabsTrigger>
          <TabsTrigger value="knowledge">Kiến thức</TabsTrigger>
          <TabsTrigger value="channels">Kênh chat</TabsTrigger>
          <TabsTrigger value="embed">Gắn lên website</TabsTrigger>
          <TabsTrigger value="inbox">Hộp thư</TabsTrigger>
          <TabsTrigger value="leads">Khách tiềm năng</TabsTrigger>
          <TabsTrigger value="settings">Cài đặt AI</TabsTrigger>
        </TabsList>

        <TabsContent value="bots" className="space-y-4">
          <div className="flex justify-end">
            <Button
              onClick={() =>
                setBotForm({
                  botName: 'Chatbot Spa',
                  consultationTone: 'friendly',
                  status: 'DRAFT',
                  industry: 'Spa / Thẩm mỹ',
                })
              }
            >
              <Plus className="h-4 w-4 mr-2" />
              Tạo chatbot
            </Button>
          </div>

          {bots.isLoading && <LoadingState />}
          {bots.isError && <ErrorState onRetry={bots.refetch} />}

          {botForm && (
            <BotFormPanel
              form={botForm}
              onChange={(patch) => setBotForm({ ...botForm, ...patch })}
              saving={createBot.isPending || updateBot.isPending}
              onSave={() => {
                if (botForm.id) {
                  updateBot.mutate(
                    { ...botForm, id: botForm.id },
                    { onSuccess: () => setBotForm(null) },
                  );
                } else {
                  createBot.mutate(botForm, {
                    onSuccess: (b) => {
                      setSelectedBotId(b.id);
                      setBotForm(null);
                    },
                  });
                }
              }}
              onCancel={() => setBotForm(null)}
              onActivate={() => {
                if (botForm.id) {
                  updateBot.mutate(
                    { ...botForm, id: botForm.id, status: 'ACTIVE' },
                    { onSuccess: () => setBotForm(null) },
                  );
                }
              }}
            />
          )}
        </TabsContent>

        <TabsContent value="knowledge" className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <Label>Chatbot:</Label>
            <Select value={botId ?? ''} onValueChange={setSelectedBotId}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Chọn bot" />
              </SelectTrigger>
              <SelectContent>
                {bots.data?.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.botName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!botId && <EmptyState title="Chọn hoặc tạo chatbot trước" />}

          {botId && (
            <>
              <div className="rounded-lg border p-4 space-y-3 max-w-2xl">
                <h3 className="font-semibold">Thêm nguồn kiến thức</h3>
                <Input
                  placeholder="Tiêu đề (VD: Bảng giá dịch vụ)"
                  value={kbForm.title}
                  onChange={(e) => setKbForm({ ...kbForm, title: e.target.value })}
                />
                <Select
                  value={kbForm.sourceType}
                  onValueChange={(v) => setKbForm({ ...kbForm, sourceType: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(SOURCE_TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Textarea
                  placeholder="Nội dung FAQ, chính sách, bảng giá..."
                  rows={5}
                  value={kbForm.content}
                  onChange={(e) => setKbForm({ ...kbForm, content: e.target.value })}
                />
                <Button
                  disabled={!kbForm.title || createKb.isPending}
                  onClick={() =>
                    createKb.mutate(
                      {
                        botId,
                        title: kbForm.title,
                        sourceType: kbForm.sourceType,
                        content: kbForm.content,
                      },
                      { onSuccess: () => setKbForm({ title: '', content: '', sourceType: 'FAQ' }) },
                    )
                  }
                >
                  Thêm nguồn
                </Button>
              </div>

              <div className="space-y-2">
                {knowledge.data?.map((src) => (
                  <div
                    key={src.id}
                    className="flex items-start justify-between gap-3 rounded-lg border p-3"
                  >
                    <div>
                      <p className="font-medium">{src.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {SOURCE_TYPE_LABELS[src.sourceType]}
                      </p>
                      <p className="text-sm mt-1 line-clamp-2">{src.content}</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => deleteKb.mutate(src.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="channels" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            {(['WEBSITE_WIDGET', 'ZALO', 'FACEBOOK', 'TELEGRAM', 'API'] as const).map((type) => (
              <div key={type} className="rounded-lg border p-4">
                <div className="flex items-center gap-2 mb-2">
                  {type === 'FACEBOOK' ? (
                    <Facebook className="h-4 w-4" />
                  ) : (
                    <Globe className="h-4 w-4" />
                  )}
                  <h3 className="font-medium">{CHANNEL_LABELS[type]}</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-3">
                  {type === 'WEBSITE_WIDGET' && 'Hiện ô chat trên website spa của bạn.'}
                  {type === 'ZALO' && 'Nhận tin nhắn từ Zalo OA (nhờ hỗ trợ kỹ thuật cấu hình).'}
                  {type === 'FACEBOOK' &&
                    'Nhận tin nhắn từ trang Facebook — kết nối bên dưới.'}
                  {type === 'TELEGRAM' && 'Nhận tin nhắn qua Telegram (nhờ hỗ trợ cấu hình).'}
                  {type === 'API' && 'Kết nối phần mềm khác — nhờ hỗ trợ kỹ thuật.'}
                </p>
                {type !== 'WEBSITE_WIDGET' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      createChannel.mutate({
                        name: CHANNEL_LABELS[type],
                        channelType: type,
                        botId: botId ?? undefined,
                      })
                    }
                  >
                    Thêm kênh
                  </Button>
                )}
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold">Kênh đã tạo</h3>
            {channels.data?.map((ch) => (
              <div key={ch.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-medium">{ch.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {CHANNEL_LABELS[ch.channelType]} · {ch.bot?.botName ?? '—'} · {ch.status}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => deleteChannel.mutate(ch.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="rounded-lg border p-4 space-y-3 max-w-xl">
            <h3 className="font-semibold flex items-center gap-2">
              <Facebook className="h-4 w-4" /> Kết nối trang Facebook
            </h3>
            <p className="text-sm text-muted-foreground">
              {canPastePageToken
                ? 'Admin/allowlist có thể dán Page Access Token để gia hạn. Token không hiển thị lại sau khi lưu.'
                : 'Kết nối Fanpage qua OAuth tại Nội dung → Kết nối kênh. Không nhập Page Access Token trên trình duyệt.'}
            </p>
            {fbWebhook.data && (
              <div className="space-y-2">
                <div
                  className={`rounded-md p-3 text-sm ${
                    fbWebhook.data.tokenHealth === 'ok' &&
                    fbWebhook.data.webhookSubscribed &&
                    (fbWebhook.data.connectedPageCount ?? 0) > 0
                      ? 'bg-emerald-50 text-emerald-800'
                      : 'bg-amber-50 text-amber-900'
                  }`}
                >
                  {fbWebhook.data.tokenHealth === 'expired'
                    ? canPastePageToken
                      ? 'Page Access Token đã hết hạn / thiếu quyền — Meta không gửi tin về hệ thống. Dán token mới bên dưới rồi Kết nối lại.'
                      : 'Token Fanpage hết hạn / thiếu quyền. Liên hệ admin hoặc kết nối lại qua OAuth tại Nội dung → Kết nối kênh.'
                    : fbWebhook.data.lastErrorCode === 'MESSENGER_STANDARD_ACCESS'
                      ? 'Token và webhook OK, nhưng Meta App chưa có Advanced Access pages_messaging — chỉ trả lời được Admin/Developer/Tester. Thêm Tester trong Meta App Roles hoặc xin Advanced Access.'
                      : fbWebhook.data.lastErrorCode === 'MISSING_SCOPE'
                        ? 'Token thiếu scope (pages_messaging / pages_manage_metadata). Kết nối lại Facebook OAuth để cấp token mới — không sửa DB thủ công.'
                    : fbWebhook.data.serverConfigured
                      ? (fbWebhook.data.connectedPageCount ?? 0) > 0
                        ? fbWebhook.data.webhookSubscribed
                          ? 'Fanpage đã kết nối và webhook sẵn sàng nhận tin Messenger.'
                          : 'Fanpage đã kết nối nhưng chưa subscribe webhook — bấm Kết nối lại.'
                        : 'Hệ thống đã cấu hình Page. Chọn chatbot rồi bấm Kết nối.'
                      : canPastePageToken
                        ? 'Chưa cấu hình Fanpage. Nhập Page ID + Page Access Token bên dưới.'
                        : 'Chưa cấu hình Fanpage. Dùng «Kết nối Facebook» tại Nội dung → Kết nối kênh.'}
                </div>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>
                    Token Page:{' '}
                    {fbWebhook.data.tokenHealth === 'ok'
                      ? 'hợp lệ'
                      : fbWebhook.data.tokenHealth === 'expired'
                        ? 'HẾT HẠN / THIẾU QUYỀN'
                        : fbWebhook.data.tokenHealth === 'decode_failed'
                          ? 'lỗi giải mã'
                          : fbWebhook.data.tokenHealth === 'missing'
                            ? 'thiếu'
                            : '—'}
                    {fbWebhook.data.tokenError ? ` (${fbWebhook.data.tokenError})` : ''}
                    {' · '}Webhook verify:{' '}
                    {fbWebhook.data.verifyTokenConfigured ? 'đã cấu hình' : 'thiếu'}
                    {' · '}Bot:{' '}
                    {fbWebhook.data.botActive ? 'ACTIVE' : 'chưa ACTIVE'}
                    {' · '}AI:{' '}
                    {fbWebhook.data.aiEnabled ? 'bật' : 'tắt'}
                  </li>
                  <li>
                    subscribed_apps:{' '}
                    {(fbWebhook.data.subscribedFields || []).join(', ') || '—'}
                    {' · '}
                    {fbWebhook.data.webhookSubscribed ? 'đã đăng ký' : 'chưa đăng ký'}
                  </li>
                  <li>
                    Realtime:{' '}
                    {fbWebhook.data.realtime?.connected
                      ? 'Redis OK'
                      : `Redis ${fbWebhook.data.realtime?.status || 'offline'}`}
                    {' · '}Lần nhận tin gần nhất:{' '}
                    {fbWebhook.data.lastWebhookAt
                      ? formatDateTime(fbWebhook.data.lastWebhookAt)
                      : 'chưa nhận'}
                    {' · '}Lỗi gần nhất:{' '}
                    {fbWebhook.data.lastErrorCode === 'MESSENGER_STANDARD_ACCESS'
                      ? 'MESSENGER_STANDARD_ACCESS (chưa Advanced Access)'
                      : fbWebhook.data.lastErrorCode === 'MISSING_SCOPE'
                        ? 'MISSING_SCOPE (reconnect OAuth)'
                        : fbWebhook.data.lastErrorCode === 'TOKEN_EXPIRED'
                          ? 'TOKEN_EXPIRED'
                          : fbWebhook.data.lastErrorCode ||
                            fbWebhook.data.lastWebhookError ||
                            'không'}
                  </li>
                  <li className="break-all">
                    Callback URL: {fbWebhook.data.webhookUrl || '—'}
                  </li>
                  <li>
                    Avatar khách Messenger:{' '}
                    {fbWebhook.data.visitorAvatarAccess === 'ok'
                      ? 'Meta cho phép lấy ảnh thật (profile_pic)'
                      : fbWebhook.data.visitorAvatarAccess === 'blocked'
                        ? 'Meta chặn ảnh — cần App Review «Business Asset User Profile Access»'
                        : fbWebhook.data.visitorAvatarAccess === 'no_data'
                          ? 'chưa có hội thoại để kiểm tra'
                          : 'chưa kiểm tra'}
                  </li>
                </ul>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={syncFbFromAutoPost.isPending}
                  onClick={() => syncFbFromAutoPost.mutate()}
                >
                  {syncFbFromAutoPost.isPending
                    ? 'Đang đồng bộ…'
                    : 'Đồng bộ Fanpage từ Auto Post'}
                </Button>
                {syncFbFromAutoPost.isError && (
                  <p className="text-sm text-red-700">
                    {(syncFbFromAutoPost.error as Error)?.message || 'Đồng bộ thất bại'}
                  </p>
                )}
                {(fbWebhook.data.hints?.length ?? 0) > 0 && (
                  <ul className="text-xs text-amber-800 list-disc pl-4 space-y-0.5">
                    {fbWebhook.data.hints!.map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {canPastePageToken ? (
              <>
                <Input
                  placeholder="Page ID (vd: 1234567890)"
                  value={fbForm.pageId}
                  onChange={(e) => setFbForm({ ...fbForm, pageId: e.target.value })}
                />
                <Input
                  type="password"
                  placeholder="Page Access Token mới (bắt buộc nếu token hết hạn)"
                  value={fbForm.pageAccessToken}
                  onChange={(e) => setFbForm({ ...fbForm, pageAccessToken: e.target.value })}
                  autoComplete="off"
                />
                <Input
                  placeholder="Tên trang (tuỳ chọn)"
                  value={fbForm.pageName}
                  onChange={(e) => setFbForm({ ...fbForm, pageName: e.target.value })}
                />
                <Button
                  disabled={!botId || connectFb.isPending}
                  onClick={() =>
                    botId &&
                    connectFb.mutate(
                      {
                        botId,
                        pageName: fbForm.pageName || undefined,
                        pageId: fbForm.pageId || undefined,
                        pageAccessToken: fbForm.pageAccessToken || undefined,
                      },
                      {
                        onSuccess: () =>
                          setFbForm({ pageName: '', pageId: '', pageAccessToken: '' }),
                      },
                    )
                  }
                >
                  {connectFb.isPending ? 'Đang kết nối…' : 'Kết nối / Gia hạn Fanpage'}
                </Button>
              </>
            ) : (
              <Button variant="outline" asChild>
                <Link href="/content?tab=channels">Kết nối Facebook</Link>
              </Button>
            )}
            {connectFb.isError && (
              <p className="text-sm text-red-700">
                {(connectFb.error as Error)?.message || 'Kết nối thất bại'}
              </p>
            )}
            {facebook.data?.map((p) => (
              <div key={p.id} className="flex justify-between items-center text-sm border-t pt-2">
                <span>
                  {p.pageName}
                  {p.webhookSubscribed === false && (
                    <span className="ml-2 text-amber-600">· webhook chưa đăng ký</span>
                  )}
                  {p.webhookSubscribed && (
                    <span className="ml-2 text-emerald-700">· webhook OK</span>
                  )}
                  <span className="ml-2 text-muted-foreground">
                    · AI {p.aiEnabled ? 'bật' : 'tắt'}
                  </span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => disconnectFb.mutate(p.id)}>
                  Ngắt kết nối
                </Button>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="embed" className="space-y-4">
          <ChatbotEmbedList
            bots={bots.data}
            isLoading={bots.isLoading}
            selectedBotId={botId}
            embedCode={embed.data?.embedCode}
            onSelectBot={setSelectedBotId}
            onDelete={(id) => deleteBot.mutate(id)}
            onUpdateStatus={(id, status) => updateBot.mutate({ id, status })}
            statusChangingId={updateBot.isPending ? (updateBot.variables?.id ?? null) : null}
            onEdit={(bot) => {
              setSelectedBotId(bot.id);
              setBotForm(bot);
            }}
          />
        </TabsContent>

        <TabsContent value="inbox" className="space-y-4">
          <ChatbotInboxFilters
            bots={bots.data || []}
            botId={selectedBotId}
            onBotIdChange={(id) => {
              setSelectedBotId(id);
              setInboxId(null);
            }}
            channel={inboxChannel}
            onChannelChange={(ch) => {
              setInboxChannel(ch);
              setInboxId(null);
            }}
            channelId={inboxChannelId}
            onChannelIdChange={(id) => {
              setInboxChannelId(id);
              setInboxId(null);
            }}
            fanpages={channelOptions.data?.fanpages}
            websites={channelOptions.data?.websites}
            unreadByBot={unreadSummary.data?.unreadByBot}
          />
          {!selectedBotId ? (
            <EmptyState
              title="Chọn Project / Bot"
              description="Hộp thư được tách theo từng Project — chọn bot để xem hội thoại Fanpage / Website của Project đó."
            />
          ) : (
          <div className="grid gap-4 md:grid-cols-2">
          <div
            ref={inboxScrollRef}
            onScroll={onInboxScroll}
            className="space-y-2 max-h-[480px] overflow-y-auto"
          >
            {inbox.isLoading && <InboxListSkeleton />}
            {inbox.isError && <ErrorState onRetry={() => void inbox.refetch()} />}
            {!inbox.isLoading && !inbox.isError && inboxItems.length === 0 && (
              <EmptyState
                title="Chưa có hội thoại"
                description="Khi khách nhắn qua Messenger hoặc widget, tin sẽ hiện ở đây."
              />
            )}
            {inboxItems.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setInboxId(c.id)}
                className={`w-full text-left rounded-lg border p-3 ${inboxId === c.id ? 'border-primary' : ''}`}
              >
                <div className="flex items-start gap-2">
                  <ChatbotVisitorAvatar
                    name={
                      c.customer?.name ||
                      c.visitorName ||
                      (c.customer?.psid || c.externalUserId
                        ? `PSID …${(c.customer?.psid || c.externalUserId || '').slice(-4)}`
                        : 'Khách')
                    }
                    src={c.customer?.avatarUrl || c.visitorAvatarUrl}
                    size={36}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">
                      {c.customer?.name ||
                        c.visitorName ||
                        (c.customer?.psid || c.externalUserId
                          ? `PSID …${(c.customer?.psid || c.externalUserId || '').slice(-4)}`
                          : null) ||
                        c.visitorPhone ||
                        c.sessionId.slice(0, 8)}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {c.fanpage?.pageName ||
                        (c.channel === 'facebook' ? 'Messenger' : c.channel)}
                      {c.fanpage?.pageId ? ` · ID ${c.fanpage.pageId}` : ''}
                      {' · '}
                      {formatDateTime(c.updatedAt)}
                    </p>
                    <p className="text-sm line-clamp-1 mt-1">
                      {c.messages?.[0]?.senderType === 'BOT' || c.messages?.[0]?.role === 'assistant'
                        ? 'Bot: '
                        : ''}
                      {c.messages?.[0]?.message}
                    </p>
                  </div>
                  <ChatbotVisitorAvatar
                    name={c.fanpage?.pageName || 'Fanpage'}
                    src={c.fanpage?.avatarUrl}
                    size={28}
                    title={c.fanpage?.pageName || c.fanpage?.pageId || 'Fanpage'}
                  />
                </div>
              </button>
            ))}
            {inbox.isFetchingNextPage && <InboxListSkeleton count={2} />}
          </div>
          <div className="rounded-lg border p-4 min-h-[320px]">
            {!inboxId && (
              <p className="text-muted-foreground text-sm">Chọn hội thoại để xem chi tiết</p>
            )}
            {inboxId && conversation.isLoading && <ConversationDetailSkeleton />}
            {inboxId && conversation.isError && (
              <ErrorState onRetry={() => void conversation.refetch()} />
            )}
            {inboxId && conversation.data && (
              <div className="mb-3 space-y-2 border-b pb-2">
                <div className="flex items-center gap-2">
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
                    <p className="text-sm font-medium truncate">
                      {conversation.data.customer?.name || conversation.data.visitorName || 'Khách'}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {conversation.data.customer?.psid
                        ? `PSID …${conversation.data.customer.psid.slice(-6)}`
                        : null}
                      {conversation.data.fanpage?.pageName
                        ? ` · Fanpage ${conversation.data.fanpage.pageName}`
                        : ''}
                      {conversation.data.fanpage?.pageId
                        ? ` (${conversation.data.fanpage.pageId})`
                        : ''}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {conversation.data.humanTakeover
                      ? 'AI đang tạm dừng (human takeover)'
                      : 'AI đang trả lời tự động'}
                  </span>
                  {conversation.data.humanTakeover ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={takeover.isPending}
                      onClick={() => takeover.mutate({ id: inboxId, resumeBot: true })}
                    >
                      Bật lại AI
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={takeover.isPending}
                      onClick={() => takeover.mutate({ id: inboxId, resumeBot: false })}
                    >
                      Nhân viên tiếp quản
                    </Button>
                  )}
                </div>
              </div>
            )}
            {conversation.data?.messages?.map((m) => {
              const inbound = m.direction === 'INBOUND' || m.role === 'user';
              const failed = m.status === 'FAILED';
              const outbound =
                m.direction === 'OUTBOUND' || m.role === 'assistant' || m.role === 'system';
              const label =
                failed || m.senderType === 'SYSTEM'
                  ? 'Hệ thống'
                  : m.senderType === 'BOT' || m.role === 'assistant'
                    ? 'Bot / Fanpage'
                    : m.senderType === 'CUSTOMER' || m.role === 'user'
                      ? 'Khách'
                      : m.senderType || m.role;
              return (
                <div
                  key={m.id}
                  className={`mb-2 text-sm ${inbound ? 'text-right' : ''}`}
                >
                  <p className="mb-0.5 text-[10px] text-muted-foreground">
                    {label}
                    {m.direction ? ` · ${m.direction}` : ''}
                  </p>
                  <span
                    className={`inline-block rounded-lg px-3 py-2 ${
                      failed
                        ? 'border border-destructive/40 bg-destructive/10 text-destructive'
                        : inbound
                          ? 'bg-primary text-primary-foreground'
                          : outbound
                            ? 'bg-muted'
                            : 'bg-muted'
                    }`}
                  >
                    {m.message}
                  </span>
                  {m.status ? (
                    <p
                      className={`mt-0.5 text-[10px] ${
                        failed ? 'font-medium text-destructive' : 'text-muted-foreground'
                      }`}
                    >
                      {failed ? 'Chưa gửi Messenger' : m.status === 'SENT' ? 'Đã gửi Messenger' : m.status}
                      {m.errorCode === 'MESSENGER_STANDARD_ACCESS'
                        ? ' · Chưa Advanced Access (chỉ Admin/Dev/Tester)'
                        : m.errorCode === 'MISSING_SCOPE'
                          ? ' · Thiếu scope — reconnect OAuth'
                          : m.errorCode === 'TOKEN_EXPIRED'
                            ? ' · Token hết hạn'
                            : m.errorCode && failed
                              ? ` · ${m.errorCode}`
                              : m.errorCode && m.status !== 'SENT'
                                ? ` · ${m.errorCode}`
                                : ''}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
          </div>
          )}
        </TabsContent>

        <TabsContent value="leads" className="space-y-2">
          {leads.data?.map((lead) => (
            <div key={lead.id} className="rounded-lg border p-3 flex justify-between gap-3">
              <div>
                <p className="font-medium">{lead.name || 'Khách ẩn danh'}</p>
                <p className="text-sm">{lead.phone}</p>
                <p className="text-sm text-muted-foreground">{lead.need}</p>
              </div>
              <div className="text-xs text-muted-foreground text-right">
                <p>{lead.bot?.botName}</p>
                <p>{formatDateTime(lead.createdAt)}</p>
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="settings" className="max-w-2xl space-y-4">
          <div className="rounded-lg border p-4 space-y-3">
            <h3 className="font-semibold">Trợ lý AI</h3>
            <p className="text-sm text-muted-foreground">
              Chatbot dùng AI để trả lời khách dựa trên kiến thức bạn đã nhập. Nếu AI chưa bật,
              hãy liên hệ hỗ trợ để kích hoạt.
            </p>
            {openAiStatus.data && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 font-medium ${
                    openAiStatus.data.configured && openAiStatus.data.ok
                      ? 'bg-emerald-100 text-emerald-700'
                      : openAiStatus.data.configured
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {openAiStatus.data.configured && openAiStatus.data.ok
                    ? 'AI đã sẵn sàng'
                    : openAiStatus.data.configured
                      ? 'AI đang kiểm tra'
                      : 'AI chưa được bật'}
                </span>
              </div>
            )}
            {openAiStatus.data?.error && (
              <p className="text-sm text-amber-700">
                Không kiểm tra được AI. Vui lòng thử lại hoặc liên hệ hỗ trợ.
              </p>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={openAiStatus.isFetching}
              onClick={() => setTestOpenAi(true)}
            >
              {openAiStatus.isFetching ? 'Đang kiểm tra…' : 'Kiểm tra AI'}
            </Button>
          </div>

          {settings.data && (
            <div className="rounded-lg border p-4 space-y-3">
              <div className="space-y-1">
                <Label>Chế độ AI</Label>
                <Input
                  value={settingsForm?.model ?? settings.data.model}
                  onChange={(e) => setSettingsForm({ ...settingsForm, model: e.target.value })}
                  placeholder="Mặc định hệ thống"
                />
                <p className="text-xs text-muted-foreground">
                  Để trống theo mặc định nếu không chắc — hỗ trợ sẽ cấu hình giúp bạn.
                </p>
              </div>
              <div className="space-y-1">
                <Label>Mức sáng tạo câu trả lời (0 = thận trọng, 1 = linh hoạt)</Label>
                <Input
                  type="number"
                  step="0.1"
                  min={0}
                  max={1}
                  value={settingsForm?.temperature ?? settings.data.temperature}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, temperature: Number(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Giới hạn số câu trả lời AI mỗi tháng</Label>
                <Input
                  type="number"
                  value={settingsForm?.monthlyLimit ?? settings.data.monthlyLimit}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, monthlyLimit: Number(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Hướng dẫn thêm cho chatbot</Label>
                <Textarea
                  rows={4}
                  placeholder="Ví dụ: luôn nhắc khách đặt lịch, xưng hô anh/chị…"
                  value={settingsForm?.systemPrompt ?? settings.data.systemPrompt ?? ''}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, systemPrompt: e.target.value })
                  }
                />
              </div>
              <Button
                onClick={() =>
                  updateSettings.mutate(settingsForm ?? {}, {
                    onSuccess: () => setSettingsForm(null),
                  })
                }
              >
                Lưu cài đặt
              </Button>
              <p className="text-xs text-muted-foreground">
                Áp dụng cho mọi chatbot của spa. Nếu AI chưa bật, chatbot vẫn trả lời từ tab Kiến
                thức.
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
