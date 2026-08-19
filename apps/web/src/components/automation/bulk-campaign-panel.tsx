'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Copy, Pause, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoadingState, EmptyState, ErrorState } from '@/components/shared/page-state';
import { useAutomationTemplates } from '@/hooks/use-automation';
import { useChannelConnections } from '@/hooks/use-channel-connections';
import { useMessagingIdentities } from '@/hooks/use-messaging-identities';
import {
  useCancelCampaign,
  useCreateMessagingCampaign,
  useDeleteCampaign,
  useDuplicateCampaign,
  useMessagingCampaigns,
  usePauseCampaign,
  useResumeCampaign,
  useScheduleCampaign,
  useStartCampaign,
  useUpdateMessagingCampaign,
} from '@/hooks/use-messaging-campaigns';
import { apiUpload } from '@/lib/api-client';
import { CHANNEL_OPTIONS, type MessageChannel } from '@/types/automation-messaging';
import {
  CAMPAIGN_STATUS_LABELS,
  type MessagingCampaignDetail,
  type MessagingSegmentConfig,
} from '@/types/messaging-campaign';
import { formatDateTime } from '@/lib/format';
import { CampaignDashboardDialog } from './campaign-dashboard-dialog';

export type BulkCampaignPrefill = {
  name?: string;
  channel?: MessageChannel;
  channelConnectionId?: string;
  messageTemplateId?: string;
  segmentConfig?: MessagingSegmentConfig;
};

type Props = {
  prefill: BulkCampaignPrefill | null;
  onPrefillConsumed: () => void;
};

type SendMode = 'now' | 'schedule';

function toDatetimeLocalValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function datetimeLocalToIsoInHcm(localValue: string): string {
  // Input datetime-local is wall clock; treat as Asia/Ho_Chi_Minh (+07, no DST).
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(localValue.trim());
  if (!m) throw new Error('Thời gian lịch không hợp lệ');
  const [, y, mo, d, h, mi] = m;
  const utcMs = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h) - 7, Number(mi), 0, 0);
  return new Date(utcMs).toISOString();
}

const NAME_FALLBACK = 'Anh/chị';

function resolvePreviewNames(displayName?: string | null) {
  const raw = String(displayName || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!raw || /^(khách(\s+messenger)?|guest|user|psid)$/i.test(raw)) {
    return { full_name: NAME_FALLBACK, first_name: NAME_FALLBACK };
  }
  return { full_name: raw, first_name: raw.split(' ')[0] || raw };
}

function renderBodyPreview(body: string, displayName?: string | null) {
  const names = resolvePreviewNames(displayName);
  return body
    .replaceAll('{{full_name}}', names.full_name)
    .replaceAll('{{first_name}}', names.first_name)
    .replaceAll('{{customer_name}}', names.full_name)
    .replace(/\{\{(\w+)\}\}/g, NAME_FALLBACK);
}

const QUICK_VARS = [
  { key: 'full_name', label: 'Tên khách hàng', token: '{{full_name}}' },
  { key: 'first_name', label: 'Tên gọi', token: '{{first_name}}' },
] as const;

export function BulkCampaignPanel({ prefill, onPrefillConsumed }: Props) {
  const campaigns = useMessagingCampaigns({ pageSize: '50' });
  const connections = useChannelConnections();
  const templates = useAutomationTemplates({ pageSize: '50' });
  const create = useCreateMessagingCampaign();
  const update = useUpdateMessagingCampaign();
  const start = useStartCampaign();
  const schedule = useScheduleCampaign();
  const pause = usePauseCampaign();
  const resume = useResumeCampaign();
  const cancel = useCancelCampaign();
  const duplicate = useDuplicateCampaign();
  const remove = useDeleteCampaign();

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dashboardId, setDashboardId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    channel: 'MESSENGER' as MessageChannel,
    channelConnectionId: '',
    messageTemplateId: '',
    body: '',
    sendMode: 'now' as SendMode,
    scheduledLocal: '',
  });
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaType, setMediaType] = useState<'image' | 'video' | ''>('');
  const [uploading, setUploading] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!prefill) return;
    setEditingId(null);
    setForm({
      name: prefill.name || 'Chiến dịch hàng loạt mới',
      channel: prefill.channel || 'MESSENGER',
      channelConnectionId: prefill.channelConnectionId || '',
      messageTemplateId: prefill.messageTemplateId || '',
      body: '',
      sendMode: 'now',
      scheduledLocal: toDatetimeLocalValue(new Date(Date.now() + 5 * 60_000)),
    });
    setSelectedIds(new Set(prefill.segmentConfig?.identityIds ?? []));
    setMediaUrl('');
    setMediaType('');
    setContactSearch('');
    setFormOpen(true);
    onPrefillConsumed();
  }, [prefill, onPrefillConsumed]);

  const identityParams = useMemo(() => {
    const p: Record<string, string> = { pageSize: '100', channel: form.channel };
    if (form.channelConnectionId) p.connectionId = form.channelConnectionId;
    if (contactSearch.trim()) p.search = contactSearch.trim();
    return p;
  }, [form.channel, form.channelConnectionId, contactSearch]);

  const identities = useMessagingIdentities(identityParams);
  const contactItems = identities.data?.items ?? [];

  const items = (campaigns.data?.items ?? []) as MessagingCampaignDetail[];
  const messengerConns = (connections.data ?? []).filter((c) => c.channel === form.channel);
  const templateItems = (templates.data?.items ?? []).filter((t) => t.channel === form.channel);

  function resetForm() {
    setEditingId(null);
    setForm({
      name: 'Chiến dịch hàng loạt mới',
      channel: 'MESSENGER',
      channelConnectionId: '',
      messageTemplateId: '',
      body: '',
      sendMode: 'now',
      scheduledLocal: toDatetimeLocalValue(new Date(Date.now() + 5 * 60_000)),
    });
    setSelectedIds(new Set());
    setMediaUrl('');
    setMediaType('');
    setContactSearch('');
  }

  function openEdit(c: MessagingCampaignDetail) {
    const vars = (c.variables ?? {}) as Record<string, string>;
    const segment = (c.segmentConfig ?? {}) as MessagingSegmentConfig;
    setEditingId(c.id);
    setForm({
      name: c.name || 'Chiến dịch hàng loạt',
      channel: c.channel,
      channelConnectionId: c.channelConnectionId || '',
      messageTemplateId: c.messageTemplateId || '',
      body: vars.body || vars.message || vars.content || '',
      sendMode: c.scheduledAt ? 'schedule' : 'now',
      scheduledLocal: c.scheduledAt
        ? toDatetimeLocalValue(new Date(c.scheduledAt))
        : toDatetimeLocalValue(new Date(Date.now() + 5 * 60_000)),
    });
    setSelectedIds(new Set(segment.identityIds ?? []));
    setMediaUrl(vars.mediaUrl || '');
    setMediaType((vars.mediaType as 'image' | 'video' | '') || '');
    setContactSearch('');
    setFormOpen(true);
  }

  function toggleContact(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedIds(new Set(contactItems.map((c) => c.id)));
  }

  async function onUploadMedia(file: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiUpload<{ url: string; mediaType: 'image' | 'video' }>(
        '/automation/messaging-campaigns/upload-media',
        fd,
      );
      setMediaUrl(res.url);
      setMediaType(res.mediaType);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Upload media thất bại');
    } finally {
      setUploading(false);
    }
  }

  async function submitForm() {
    if (!form.channelConnectionId) {
      window.alert('Chọn Fanpage/Zalo OA đã kết nối');
      return;
    }
    if (!form.body.trim() && !form.messageTemplateId && !mediaUrl) {
      window.alert('Nhập nội dung tin nhắn hoặc đính kèm ảnh/video');
      return;
    }
    if (selectedIds.size === 0) {
      window.alert('Chọn ít nhất một nick đã từng liên hệ Fanpage/OA này');
      return;
    }
    if (form.sendMode === 'schedule' && !form.scheduledLocal) {
      window.alert('Chọn ngày giờ gửi');
      return;
    }

    setSubmitting(true);
    try {
      const variables: Record<string, string> = {};
      if (form.body.trim()) variables.body = form.body.trim();
      if (mediaUrl) {
        variables.mediaUrl = mediaUrl;
        variables.mediaType = mediaType || 'image';
      }

      const payload = {
        name: form.name.trim() || 'Chiến dịch hàng loạt',
        channel: form.channel,
        campaignType: 'BROADCAST' as const,
        channelConnectionId: form.channelConnectionId,
        messageTemplateId: form.messageTemplateId || undefined,
        segmentConfig: {
          identityIds: [...selectedIds],
          excludeSuppressed: true,
          requireOptIn: false,
        },
        variables,
        timezone: 'Asia/Ho_Chi_Minh',
      };

      let campaignId = editingId;
      if (editingId) {
        await update.mutateAsync({ id: editingId, ...payload });
      } else {
        const created = await create.mutateAsync(payload);
        campaignId = created.id;
      }

      if (!campaignId) throw new Error('Thiếu campaign id');

      if (form.sendMode === 'schedule') {
        const scheduledAt = datetimeLocalToIsoInHcm(form.scheduledLocal);
        await schedule.mutateAsync({
          id: campaignId,
          scheduledAt,
          timezone: 'Asia/Ho_Chi_Minh',
        });
      } else if (!editingId) {
        // Tạo mới + gửi ngay
        await start.mutateAsync(campaignId);
      } else {
        // Sửa xong: hỏi có chạy luôn không
        const runNow = window.confirm('Đã lưu. Chạy chiến dịch ngay bây giờ?');
        if (runNow) await start.mutateAsync(campaignId);
      }

      setFormOpen(false);
      resetForm();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Không lưu được chiến dịch');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            resetForm();
            setFormOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Tạo chiến dịch
        </Button>
      </div>

      {campaigns.isLoading && <LoadingState message="Đang tải chiến dịch…" />}
      {campaigns.isError && <ErrorState onRetry={campaigns.refetch} />}
      {!campaigns.isLoading && !campaigns.isError && items.length === 0 && (
        <EmptyState
          title="Chưa có chiến dịch hàng loạt"
          description="Tạo chiến dịch hoặc chọn liên hệ từ tab Tệp khách hàng."
        />
      )}

      <div className="grid gap-3">
        {items.map((c) => (
          <div key={c.id} className="rounded-lg border p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">{c.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {c.channel} · {c.channelConnection?.displayName || c.messageTemplate?.name || '—'} ·{' '}
                  {formatDateTime(c.createdAt)}
                  {c.scheduledAt ? ` · Lịch ${formatDateTime(c.scheduledAt)}` : ''}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Badge variant="outline">{CAMPAIGN_STATUS_LABELS[c.status] ?? c.status}</Badge>
                  <Badge variant="secondary">
                    Gửi {c.sentCount}/{c.totalRecipients || c.eligibleCount || 0}
                  </Badge>
                  {(c.deliveredCount ?? 0) > 0 && (
                    <Badge variant="outline">Delivered {c.deliveredCount}</Badge>
                  )}
                  {(c.readCount ?? 0) > 0 && <Badge variant="outline">Read {c.readCount}</Badge>}
                  {(c.failedCount ?? 0) > 0 && (
                    <Badge variant="destructive">Failed {c.failedCount}</Badge>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                <Button variant="outline" size="sm" onClick={() => setDashboardId(c.id)}>
                  <BarChart3 className="mr-1 h-3.5 w-3.5" />
                  Báo cáo
                </Button>
                {c.status !== 'RUNNING' && c.status !== 'PLANNING' && (
                  <Button variant="outline" size="sm" onClick={() => openEdit(c)}>
                    <Pencil className="mr-1 h-3.5 w-3.5" />
                    Sửa
                  </Button>
                )}
                {(c.status === 'DRAFT' || c.status === 'SCHEDULED' || c.status === 'PAUSED') && (
                  <Button size="sm" onClick={() => start.mutate(c.id)} disabled={start.isPending}>
                    <Play className="mr-1 h-3.5 w-3.5" />
                    Chạy
                  </Button>
                )}
                {c.status === 'RUNNING' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => pause.mutate(c.id)}
                    disabled={pause.isPending}
                  >
                    <Pause className="mr-1 h-3.5 w-3.5" />
                    Tạm dừng
                  </Button>
                )}
                {c.status === 'PAUSED' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => resume.mutate(c.id)}
                    disabled={resume.isPending}
                  >
                    Tiếp tục
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => duplicate.mutate(c.id)}
                  title="Nhân bản"
                >
                  <Copy className="h-4 w-4" />
                </Button>
                {c.status !== 'RUNNING' && c.status !== 'PLANNING' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    title="Xóa"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (window.confirm(`Xóa chiến dịch "${c.name}"?`)) remove.mutate(c.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
                {['RUNNING', 'PAUSED', 'SCHEDULED', 'PLANNING'].includes(c.status) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => cancel.mutate(c.id)}
                  >
                    Hủy
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Sửa chiến dịch hàng loạt' : 'Tạo chiến dịch hàng loạt'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Tên chiến dịch</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Kênh</Label>
                <Select
                  value={form.channel}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      channel: v as MessageChannel,
                      channelConnectionId: '',
                      messageTemplateId: '',
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHANNEL_OPTIONS.filter(
                      (c) => c.value === 'MESSENGER' || c.value === 'ZALO',
                    ).map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Fanpage / Zalo OA</Label>
                <Select
                  value={form.channelConnectionId || '__none__'}
                  onValueChange={(v) => {
                    setForm((f) => ({
                      ...f,
                      channelConnectionId: v === '__none__' ? '' : v,
                    }));
                    setSelectedIds(new Set());
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn kết nối" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Chọn Fanpage/OA —</SelectItem>
                    {messengerConns.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.displayName || c.accountRef} ({c.status})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label>Nội dung tin nhắn</Label>
                <div className="flex flex-wrap gap-1">
                  {QUICK_VARS.map((v) => (
                    <Button
                      key={v.key}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        const el = bodyRef.current;
                        const token = v.token;
                        if (!el) {
                          setForm((f) => ({ ...f, body: `${f.body}${token}` }));
                          return;
                        }
                        const start = el.selectionStart ?? form.body.length;
                        const end = el.selectionEnd ?? start;
                        const next =
                          form.body.slice(0, start) + token + form.body.slice(end);
                        setForm((f) => ({ ...f, body: next }));
                        requestAnimationFrame(() => {
                          el.focus();
                          const pos = start + token.length;
                          el.setSelectionRange(pos, pos);
                        });
                      }}
                    >
                      + {v.label}
                    </Button>
                  ))}
                </div>
              </div>
              <Textarea
                ref={bodyRef}
                rows={4}
                placeholder="VD: Chào anh {{full_name}}, chúng tôi có chương trình khuyến mãi..."
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Dùng {'{{full_name}}'} / {'{{first_name}}'} — mỗi người nhận được thay bằng đúng tên
                Facebook của họ. Thiếu tên → «Anh/chị».
              </p>
              {form.body.trim() && selectedIds.size > 0 && (
                <div className="rounded-md border bg-muted/30 p-2 space-y-1.5">
                  <p className="text-xs font-medium">Preview theo từng nick đã chọn</p>
                  {[...selectedIds].slice(0, 5).map((id) => {
                    const row = contactItems.find((c) => c.id === id);
                    const name = row?.displayName || row?.externalUserId || '—';
                    return (
                      <div key={id} className="text-xs border-t pt-1.5 first:border-0 first:pt-0">
                        <span className="text-muted-foreground">{name}: </span>
                        <span>{renderBodyPreview(form.body, row?.displayName)}</span>
                      </div>
                    );
                  })}
                  {selectedIds.size > 5 ? (
                    <p className="text-xs text-muted-foreground">
                      … và {selectedIds.size - 5} nick khác
                    </p>
                  ) : null}
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Mẫu tin (tuỳ chọn)</Label>
                <Select
                  value={form.messageTemplateId || '__none__'}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, messageTemplateId: v === '__none__' ? '' : v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn mẫu" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Không dùng mẫu —</SelectItem>
                    {templateItems.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Ảnh / Video</Label>
                <Input
                  type="file"
                  accept="image/*,video/*"
                  disabled={uploading}
                  onChange={(e) => void onUploadMedia(e.target.files?.[0] ?? null)}
                />
                {mediaUrl ? (
                  <p className="text-xs text-muted-foreground truncate">
                    {mediaType || 'media'}: {mediaUrl}
                    <button
                      type="button"
                      className="ml-2 underline"
                      onClick={() => {
                        setMediaUrl('');
                        setMediaType('');
                      }}
                    >
                      Xóa
                    </button>
                  </p>
                ) : null}
              </div>
            </div>

            <div className="space-y-2 rounded-md border p-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[180px] flex-1 space-y-1">
                  <Label>Nick đã liên hệ Fanpage này</Label>
                  <Input
                    placeholder="Tìm tên / PSID…"
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    disabled={!form.channelConnectionId}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!contactItems.length}
                  onClick={selectAllVisible}
                >
                  Chọn tất cả
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={selectedIds.size === 0}
                  onClick={() => setSelectedIds(new Set())}
                >
                  Bỏ chọn
                </Button>
              </div>
              {!form.channelConnectionId && (
                <p className="text-xs text-muted-foreground">Chọn Fanpage/OA để tải danh sách nick.</p>
              )}
              {form.channelConnectionId && identities.isLoading && (
                <p className="text-xs text-muted-foreground">Đang tải liên hệ…</p>
              )}
              {form.channelConnectionId && !identities.isLoading && contactItems.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Chưa có nick từng nhắn Fanpage/OA này.
                </p>
              )}
              {contactItems.length > 0 && (
                <div className="max-h-48 overflow-y-auto rounded border">
                  <table className="w-full text-sm">
                    <tbody>
                      {contactItems.map((row) => (
                        <tr key={row.id} className="border-t">
                          <td className="p-2 w-8">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(row.id)}
                              onChange={() => toggleContact(row.id)}
                            />
                          </td>
                          <td className="p-2 font-medium">
                            {row.displayName || row.externalUserId}
                          </td>
                          <td className="p-2 text-muted-foreground">
                            {row.optedOut ? 'Opt-out' : row.consentStatus}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-muted-foreground">Đã chọn {selectedIds.size} nick</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Hình thức gửi</Label>
                <Select
                  value={form.sendMode}
                  onValueChange={(v) => setForm((f) => ({ ...f, sendMode: v as SendMode }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="now">Gửi ngay</SelectItem>
                    <SelectItem value="schedule">Đặt lịch</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.sendMode === 'schedule' && (
                <div className="space-y-1">
                  <Label>Ngày giờ (Asia/Ho_Chi_Minh)</Label>
                  <Input
                    type="datetime-local"
                    value={form.scheduledLocal}
                    onChange={(e) => setForm((f) => ({ ...f, scheduledLocal: e.target.value }))}
                  />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Hủy
            </Button>
            <Button
              onClick={() => void submitForm()}
              disabled={submitting || create.isPending || update.isPending}
            >
              {submitting
                ? 'Đang xử lý…'
                : editingId
                  ? form.sendMode === 'schedule'
                    ? 'Lưu & đặt lịch'
                    : 'Lưu'
                  : form.sendMode === 'schedule'
                    ? 'Tạo & đặt lịch'
                    : 'Tạo & gửi ngay'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CampaignDashboardDialog
        open={!!dashboardId}
        onOpenChange={(o) => !o && setDashboardId(null)}
        campaignId={dashboardId}
      />
    </div>
  );
}

export default BulkCampaignPanel;
