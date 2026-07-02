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
  useChatbotConversation,
} from '@/hooks/use-chatbot-cskh';
import { CHANNEL_LABELS, SOURCE_TYPE_LABELS, type ChatbotBot } from '@/types/chatbot-cskh';
import { formatDateTime } from '@/lib/format';
import { copyToClipboard } from '@/lib/copy-to-clipboard';
import { BotFormPanel } from '@/components/chatbot-cskh/bot-form-panel';
import { ChatbotEmbedList } from '@/components/chatbot-cskh/chatbot-embed-list';

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
  const [fbForm, setFbForm] = useState({ pageId: '', pageName: '', pageAccessToken: '' });
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
  const channels = useChatbotChannels();
  const inbox = useChatbotInbox();
  const conversation = useChatbotConversation(inboxId);
  const leads = useChatbotLeads();
  const settings = useChatbotSettings();
  const openAiStatus = useChatbotOpenAiStatus(testOpenAi);
  const facebook = useChatbotFacebookPages();
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
        description="Tạo chatbot AI, quản lý kiến thức và triển khai lên website, Zalo, Facebook Fanpage"
      />

      {overview.isLoading && <LoadingState />}
      {overview.isError && <ErrorState onRetry={overview.refetch} />}

      {overview.data && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Chatbot" value={overview.data.botsActive} icon={Bot} />
          <StatCard
            label="Hội thoại"
            value={overview.data.conversationsTotal}
            icon={MessageSquare}
          />
          <StatCard label="Lead hôm nay" value={overview.data.leadsToday} icon={Users} />
          <StatCard
            label="AI replies còn lại"
            value={`${overview.data.repliesRemaining}/${overview.data.monthlyReplyLimit}`}
            icon={Zap}
          />
        </div>
      )}

      <Tabs defaultValue="bots">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="bots">Chatbot</TabsTrigger>
          <TabsTrigger value="knowledge">Kiến thức</TabsTrigger>
          <TabsTrigger value="channels">Kênh triển khai</TabsTrigger>
          <TabsTrigger value="embed">Mã nhúng</TabsTrigger>
          <TabsTrigger value="inbox">Hộp thư</TabsTrigger>
          <TabsTrigger value="leads">Lead</TabsTrigger>
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
                  {type === 'WEBSITE_WIDGET' && 'Nhúng widget JS lên website spa.'}
                  {type === 'ZALO' && 'Kết nối Zalo OA qua webhook (cấu hình token trong kênh).'}
                  {type === 'FACEBOOK' &&
                    'Kết nối Fanpage Messenger — xem tab mã nhúng & Facebook.'}
                  {type === 'TELEGRAM' && 'Bot Telegram qua API token.'}
                  {type === 'API' && 'Tích hợp qua REST API public message/lead.'}
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
              <Facebook className="h-4 w-4" /> Kết nối Facebook Fanpage
            </h3>
            <Input
              placeholder="Page ID"
              value={fbForm.pageId}
              onChange={(e) => setFbForm({ ...fbForm, pageId: e.target.value })}
            />
            <Input
              placeholder="Tên Fanpage"
              value={fbForm.pageName}
              onChange={(e) => setFbForm({ ...fbForm, pageName: e.target.value })}
            />
            <Input
              type="password"
              placeholder="Page Access Token"
              value={fbForm.pageAccessToken}
              onChange={(e) => setFbForm({ ...fbForm, pageAccessToken: e.target.value })}
            />
            <Button
              disabled={!botId || !fbForm.pageId || !fbForm.pageAccessToken || connectFb.isPending}
              onClick={() =>
                botId &&
                connectFb.mutate(
                  { botId, ...fbForm },
                  { onSuccess: () => setFbForm({ pageId: '', pageName: '', pageAccessToken: '' }) },
                )
              }
            >
              Kết nối Fanpage
            </Button>
            {facebook.data?.map((p) => (
              <div key={p.id} className="flex justify-between items-center text-sm border-t pt-2">
                <span>
                  {p.pageName} ({p.pageId})
                </span>
                <Button size="sm" variant="ghost" onClick={() => disconnectFb.mutate(p.id)}>
                  Ngắt
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
              <p className="text-xs text-muted-foreground">API public: {embed.data.publicApiUrl}</p>
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
                  {c.visitorName || c.visitorPhone || c.sessionId.slice(0, 8)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {c.bot?.botName} · {c.channel} · {formatDateTime(c.updatedAt)}
                </p>
                <p className="text-sm line-clamp-1 mt-1">{c.messages?.[0]?.message}</p>
              </button>
            ))}
          </div>
          <div className="rounded-lg border p-4 min-h-[320px]">
            {!inboxId && (
              <p className="text-muted-foreground text-sm">Chọn hội thoại để xem chi tiết</p>
            )}
            {conversation.data?.messages?.map((m) => (
              <div key={m.id} className={`mb-2 text-sm ${m.role === 'user' ? 'text-right' : ''}`}>
                <span
                  className={`inline-block rounded-lg px-3 py-2 ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
                >
                  {m.message}
                </span>
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
            <h3 className="font-semibold">OpenAI API</h3>
            <p className="text-sm text-muted-foreground">
              Thêm <code>OPENAI_API_KEY</code> vào file <code>.env</code> của server API rồi khởi
              động lại API.
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
                    ? 'Đã kết nối OpenAI'
                    : openAiStatus.data.configured
                      ? 'Key có nhưng chưa xác minh'
                      : 'Chưa cấu hình key'}
                </span>
                <span className="text-muted-foreground">Model: {openAiStatus.data.model}</span>
              </div>
            )}
            {openAiStatus.data?.error && (
              <p className="text-sm text-amber-700">{openAiStatus.data.error}</p>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={openAiStatus.isFetching}
              onClick={() => setTestOpenAi(true)}
            >
              {openAiStatus.isFetching ? 'Đang kiểm tra…' : 'Kiểm tra kết nối OpenAI'}
            </Button>
          </div>

          {settings.data && (
            <div className="rounded-lg border p-4 space-y-3">
              <div className="space-y-1">
                <Label>Model OpenAI</Label>
                <Input
                  value={settingsForm?.model ?? settings.data.model}
                  onChange={(e) => setSettingsForm({ ...settingsForm, model: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Temperature (0-1)</Label>
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
                <Label>Giới hạn reply/tháng</Label>
                <Input
                  type="number"
                  value={settingsForm?.monthlyLimit ?? settings.data.monthlyLimit}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, monthlyLimit: Number(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>System prompt bổ sung</Label>
                <Textarea
                  rows={4}
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
                Model và temperature áp dụng cho mọi chatbot trong tổ chức. Không có OpenAI key,
                chatbot vẫn trả lời từ kiến thức đã nhập.
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
