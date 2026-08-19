'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, FileText, PenLine, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { EmailEditor } from '@/components/email-marketing/email-editor';
import {
  useCreateEmailCampaign,
  useCreateEmailTemplate,
  useEmailAudiencePreview,
  useEmailDomains,
  useEmailLists,
  useEmailTemplates,
  useScheduleEmailCampaign,
  useSendEmailCampaign,
} from '@/hooks/use-email-marketing';
import type { EmailTemplate } from '@/types/email-marketing';
import { ApiError } from '@/lib/api-client';
import {
  compileEmailHtml,
  defaultEmailBlocks,
  parseEmailHtml,
  type EmailBlock,
} from '@/lib/email-editor';

const STEPS = [
  { n: 1, label: 'Người nhận' },
  { n: 2, label: 'Mẫu email' },
  { n: 3, label: 'Xem trước' },
  { n: 4, label: 'Gửi' },
] as const;

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function defaultScheduleValue() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function errorMessage(err: unknown) {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Không tạo được chiến dịch. Thử lại.';
}

type AudienceChoice = 'all' | string;

export function EmailCampaignWizard({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const lists = useEmailLists({ pageSize: '50' });
  const senderDomains = useEmailDomains();
  const templatesQuery = useEmailTemplates({ pageSize: '50' });
  const createTemplate = useCreateEmailTemplate();
  const createCampaign = useCreateEmailCampaign();
  const sendCampaign = useSendEmailCampaign();
  const scheduleCampaign = useScheduleEmailCampaign();

  const [step, setStep] = useState(1);
  const [audience, setAudience] = useState<AudienceChoice | null>(null);
  const [templateId, setTemplateId] = useState<string | 'new' | null>(null);
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [blocks, setBlocks] = useState<EmailBlock[]>(() => defaultEmailBlocks());
  const [sendMode, setSendMode] = useState<'now' | 'later'>('now');
  const [scheduledAt, setScheduledAt] = useState(defaultScheduleValue);
  const [senderDomainId, setSenderDomainId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const listId = audience && audience !== 'all' ? audience : undefined;
  const allPreview = useEmailAudiencePreview(undefined, open);
  const listPreview = useEmailAudiencePreview(listId, open && Boolean(listId));
  const preview = listId ? listPreview : allPreview;

  const templates = (templatesQuery.data?.items ?? []).filter((t) => t.category !== 'campaign');
  const groups = lists.data?.items ?? [];
  const eligible = audience === null ? 0 : (preview.data?.eligible ?? 0);
  const verifiedSenders = (senderDomains.data ?? []).filter((d) => d.domainVerified);

  const audienceLabel =
    audience === 'all'
      ? 'Tất cả đang nhận email'
      : groups.find((g) => g.id === audience)?.name || 'Nhóm';

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setAudience(null);
    setTemplateId(null);
    setName('');
    setSubject('');
    setPreviewText('');
    setBlocks(defaultEmailBlocks());
    setSendMode('now');
    setScheduledAt(defaultScheduleValue());
    setSenderDomainId('');
    setError(null);
  }, [open]);

  useEffect(() => {
    if (step === 3 && !name.trim()) {
      const today = new Date();
      setName(`Email ${audienceLabel} ${pad(today.getDate())}/${pad(today.getMonth() + 1)}`);
    }
  }, [step, audienceLabel, name]);

  function applyTemplate(t: EmailTemplate | 'new') {
    if (t === 'new') {
      setTemplateId('new');
      setSubject('');
      setPreviewText('');
      setBlocks(defaultEmailBlocks());
      return;
    }
    setTemplateId(t.id);
    setSubject(t.subject);
    setPreviewText(t.previewText ?? '');
    setBlocks(parseEmailHtml(t.htmlBody));
  }

  const canNext = useMemo(() => {
    if (step === 1) return audience !== null && eligible > 0 && !preview.isLoading;
    if (step === 2) return templateId !== null;
    if (step === 3) return Boolean(name.trim() && subject.trim() && blocks.length > 0);
    return true;
  }, [step, audience, eligible, preview.isLoading, templateId, name, subject, blocks]);

  const busy =
    createTemplate.isPending ||
    createCampaign.isPending ||
    sendCampaign.isPending ||
    scheduleCampaign.isPending;

  async function finish() {
    setError(null);
    if (sendMode === 'later') {
      const when = new Date(scheduledAt);
      if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now() + 60_000) {
        setError('Chọn thời điểm gửi ít nhất 1 phút nữa.');
        return;
      }
    }
    try {
      const template = await createTemplate.mutateAsync({
        name: `Chiến dịch: ${name.trim()}`,
        subject: subject.trim(),
        previewText: previewText.trim() || undefined,
        htmlBody: compileEmailHtml(blocks, previewText),
        category: 'campaign',
        isActive: false,
      });
      const campaign = await createCampaign.mutateAsync({
        name: name.trim(),
        subject: subject.trim(),
        templateId: template.id,
        listId: audience === 'all' ? undefined : audience || undefined,
        senderDomainId: senderDomainId || undefined,
      });
      if (sendMode === 'now') {
        await sendCampaign.mutateAsync(campaign.id);
      } else {
        await scheduleCampaign.mutateAsync({
          id: campaign.id,
          scheduledAt: new Date(scheduledAt).toISOString(),
        });
      }
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-5xl flex-col gap-4 overflow-hidden">
        <DialogHeader>
          <DialogTitle>Tạo chiến dịch email</DialogTitle>
        </DialogHeader>

        <ol className="flex gap-2">
          {STEPS.map((s) => (
            <li
              key={s.n}
              className={cn(
                'flex min-w-0 flex-1 items-center gap-2 rounded-md border px-2 py-1.5 text-xs sm:text-sm',
                s.n === step
                  ? 'border-primary bg-primary/10 font-medium'
                  : s.n < step
                    ? 'border-primary/40 text-muted-foreground'
                    : 'text-muted-foreground',
              )}
            >
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs',
                  s.n === step || s.n < step ? 'bg-primary text-primary-foreground' : 'bg-muted',
                )}
              >
                {s.n < step ? <Check className="h-3.5 w-3.5" /> : s.n}
              </span>
              <span className="truncate">{s.label}</span>
            </li>
          ))}
        </ol>

        {preview.data && audience !== null && (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            Sẽ gửi tới <strong>{preview.data.eligible}</strong> người
            {preview.data.skippedUnsubscribed + preview.data.skippedSuppressed > 0
              ? ` (bỏ qua ${preview.data.skippedUnsubscribed + preview.data.skippedSuppressed} người không nhận email)`
              : ''}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Chọn ai sẽ nhận email này.</p>
              <button
                type="button"
                onClick={() => setAudience('all')}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg border p-4 text-left',
                  audience === 'all' ? 'border-primary bg-primary/5' : 'hover:bg-muted/40',
                )}
              >
                <span className="flex items-center gap-2 font-medium">
                  <Users className="h-4 w-4" /> Tất cả đang nhận email
                </span>
                <span className="text-sm text-muted-foreground">
                  {allPreview.data ? `${allPreview.data.eligible} người` : 'Đang đếm…'}
                </span>
              </button>
              {groups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setAudience(g.id)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg border p-4 text-left',
                    audience === g.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/40',
                  )}
                >
                  <span className="font-medium">{g.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {audience === g.id && preview.data
                      ? `${preview.data.eligible} người nhận`
                      : `${g._count?.members ?? 0} trong nhóm`}
                  </span>
                </button>
              ))}
              {!groups.length && (
                <p className="text-sm text-muted-foreground">
                  Chưa có nhóm. Có thể gửi cho tất cả, hoặc tạo nhóm ở tab Danh bạ.
                </p>
              )}
              {audience !== null && !preview.isLoading && eligible === 0 && (
                <p className="text-sm text-destructive">
                  Chưa có người nhận hợp lệ. Thêm khách trong Danh bạ rồi quay lại.
                </p>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Chọn mẫu có sẵn hoặc soạn email mới.</p>
              <button
                type="button"
                onClick={() => applyTemplate('new')}
                className={cn(
                  'flex w-full items-start gap-3 rounded-lg border p-4 text-left',
                  templateId === 'new' ? 'border-primary bg-primary/5' : 'hover:bg-muted/40',
                )}
              >
                <PenLine className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <span className="block font-medium">Soạn email mới</span>
                  <span className="text-sm text-muted-foreground">Bắt đầu từ trang trắng</span>
                </span>
              </button>
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => applyTemplate(t)}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-lg border p-4 text-left',
                    templateId === t.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/40',
                  )}
                >
                  <FileText className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <span className="block font-medium">{t.name}</span>
                    <span className="text-sm text-muted-foreground">{t.subject}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {step === 3 && (
            <EmailEditor
              subject={subject}
              previewText={previewText}
              blocks={blocks}
              onSubjectChange={setSubject}
              onPreviewTextChange={setPreviewText}
              onBlocksChange={setBlocks}
              extraTop={
                <div className="space-y-1">
                  <Label>Tên chiến dịch</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
              }
            />
          )}

          {step === 4 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Kiểm tra lại trước khi gửi.</p>
              {verifiedSenders.length > 0 && (
                <div className="space-y-1">
                  <Label>Gửi từ</Label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={senderDomainId}
                    onChange={(e) => setSenderDomainId(e.target.value)}
                  >
                    <option value="">Mặc định hệ thống</option>
                    {verifiedSenders.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.fromName} ({d.fromEmail})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="space-y-2 rounded-lg border p-4 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Chiến dịch</span>
                  <span className="font-medium">{name}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Người nhận</span>
                  <span className="font-medium">
                    {audienceLabel} · {eligible} người
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Tiêu đề</span>
                  <span className="font-medium">{subject}</span>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setSendMode('now')}
                  className={cn(
                    'rounded-lg border p-4 text-left',
                    sendMode === 'now' ? 'border-primary bg-primary/5' : 'hover:bg-muted/40',
                  )}
                >
                  <span className="block font-medium">Gửi ngay</span>
                  <span className="text-sm text-muted-foreground">Đưa vào hàng đợi gửi</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSendMode('later')}
                  className={cn(
                    'rounded-lg border p-4 text-left',
                    sendMode === 'later' ? 'border-primary bg-primary/5' : 'hover:bg-muted/40',
                  )}
                >
                  <span className="block font-medium">Lên lịch</span>
                  <span className="text-sm text-muted-foreground">Chọn ngày giờ gửi</span>
                </button>
              </div>
              {sendMode === 'later' && (
                <div className="space-y-1">
                  <Label>Thời điểm gửi</Label>
                  <Input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center justify-between gap-2 border-t pt-3">
          {step > 1 ? (
            <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)} disabled={busy}>
              <ChevronLeft className="mr-1 h-4 w-4" /> Quay lại
            </Button>
          ) : (
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
          )}
          {step < 4 ? (
            <Button type="button" onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
              Tiếp tục
            </Button>
          ) : (
            <Button type="button" onClick={() => void finish()} disabled={busy || eligible < 1}>
              {busy
                ? 'Đang xử lý…'
                : sendMode === 'now'
                  ? `Gửi cho ${eligible} người`
                  : `Lên lịch gửi ${eligible} người`}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
