'use client';

import { useEffect, useMemo, useState, type ElementType } from 'react';
import {
  Bot,
  Copy,
  Globe,
  MessageSquare,
  Plus,
  Trash2,
  Users,
  Zap,
  Facebook,
  Code2,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { LoadingState, EmptyState, ErrorState } from '@/components/shared/page-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
} from '@/hooks/use-chatbot-cskh';
import { CHANNEL_LABELS, SOURCE_TYPE_LABELS, type ChatbotBot } from '@/types/chatbot-cskh';
import { formatDateTime } from '@/lib/format';
import { copyToClipboard } from '@/lib/copy-to-clipboard';
import { BotFormPanel } from '@/components/chatbot-cskh/bot-form-panel';
import { ChatbotEmbedList } from '@/components/chatbot-cskh/chatbot-embed-list';
import { useAutoPostStatus } from '@/hooks/use-auto-post';
import Link from 'next/link';

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

function copyText(text: string) {
  void copyToClipboard(text);
}

export default function ChatbotCskhPage() {
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [inboxId, setInboxId] = useState<string | null>(null);
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

  const overview = useChatbotOverview();
  const bots = useChatbotBots();
  const knowledge = useChatbotKnowledge(selectedBotId ?? undefined);
  const { data: autoPostStatus } = useAutoPostStatus();
  const canPastePageToken = Boolean(autoPostStatus?.canUseServerEnv);
  const channels = useChatbotChannels();
  const inbox = useChatbotInbox();
  const conversation = useChatbotConversation(inboxId);
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

  useEffect(() => {
    if (!selectedBotId && bots.data?.[0]?.id) {
      setSelectedBotId(bots.data[0].id);
    }
  }, [bots.data, selectedBotId]);

  const activeBot = useMemo(
    () => bots.data?.find((b) => b.id === selectedBotId) ?? bots.data?.[0],
    [bots.data, selectedBotId],
  );

  const botId = activeBot?.id ?? null;

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

      <Tabs defaultValue="bots">
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
                    {fbWebhook.data.lastErrorCode || fbWebhook.data.lastWebhookError || 'không'}
                  </li>
                  <li className="break-all">
                    Callback URL: {fbWebhook.data.webhookUrl || '—'}
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
          <div className="flex gap-2 items-center">
            <Label>Chatbot:</Label>
            <Select value={botId ?? ''} onValueChange={setSelectedBotId}>
              <SelectTrigger className="w-[220px]">
                <SelectValue />
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

          {embed.data && (
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Code2 className="h-4 w-4" />
                <h3 className="font-semibold">Mã nhúng Website</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Dán đoạn mã sau trước thẻ <code>&lt;/body&gt;</code> trên website. Chatbot chỉ hoạt
                động khi bot ở trạng thái <strong>Đang chạy</strong>.
              </p>
              <pre className="rounded bg-muted p-3 text-xs overflow-x-auto whitespace-pre-wrap">
                {embed.data.embedCode}
              </pre>
              <Button size="sm" variant="outline" onClick={() => copyText(embed.data!.embedCode)}>
                <Copy className="h-4 w-4 mr-2" /> Sao chép mã
              </Button>
              <p className="text-xs text-muted-foreground">
                Sau khi dán mã, ô chat sẽ hiện trên website của bạn.
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="inbox" className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 max-h-[480px] overflow-y-auto">
            {inbox.data?.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setInboxId(c.id)}
                className={`w-full text-left rounded-lg border p-3 ${inboxId === c.id ? 'border-primary' : ''}`}
              >
                <p className="font-medium">
                  {c.visitorName ||
                    (c.channel === 'facebook' ? 'Khách Messenger' : null) ||
                    c.visitorPhone ||
                    c.sessionId.slice(0, 8)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {c.bot?.botName} ·{' '}
                  {c.channel === 'facebook' ? 'Messenger' : c.channel} ·{' '}
                  {formatDateTime(c.updatedAt)}
                </p>
                <p className="text-sm line-clamp-1 mt-1">{c.messages?.[0]?.message}</p>
              </button>
            ))}
          </div>
          <div className="rounded-lg border p-4 min-h-[320px]">
            {!inboxId && (
              <p className="text-muted-foreground text-sm">Chọn hội thoại để xem chi tiết</p>
            )}
            {inboxId && conversation.data && (
              <div className="mb-3 flex flex-wrap items-center gap-2 border-b pb-2">
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
            )}
            {conversation.data?.messages?.map((m) => (
              <div key={m.id} className={`mb-2 text-sm ${m.role === 'user' ? 'text-right' : ''}`}>
                <span
                  className={`inline-block rounded-lg px-3 py-2 ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
                >
                  {m.message}
                </span>
                {m.status ? (
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {m.status}
                    {m.errorCode ? ` · ${m.errorCode}` : ''}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
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
    </div>
  );
}
