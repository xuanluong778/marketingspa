'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Globe, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/crm/confirm-dialog';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/page-state';
import { cn } from '@/lib/utils';
import { copyToClipboard } from '@/lib/copy-to-clipboard';
import { ApiError } from '@/lib/api-client';
import {
  useCreateEmailDomain,
  useDeleteEmailDomain,
  useEmailDomains,
  useUpdateEmailDomain,
  useVerifyEmailDomain,
} from '@/hooks/use-email-marketing';
import {
  DOMAIN_STATUS_LABELS,
  type EmailDomainDnsRecord,
  type EmailSenderDomain,
} from '@/types/email-marketing';
import { useT } from '@/i18n/i18n-provider';

const STEPS = [
  { n: 1, label: 'Thông tin gửi' },
  { n: 2, label: 'Thêm bản ghi' },
  { n: 3, label: 'Kiểm tra' },
] as const;

function errorMessage(err: unknown, fallback: string) {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

function Mark({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
      <span className="text-sm font-medium">{label}</span>
      <span className={cn('text-sm font-semibold', ok ? 'text-emerald-600' : 'text-destructive')}>
        {ok ? '✅' : '❌'}
      </span>
    </div>
  );
}

function DnsRow({ record }: { record: EmailDomainDnsRecord }) {
  const [copied, setCopied] = useState<'host' | 'value' | null>(null);
  async function copy(which: 'host' | 'value') {
    const ok = await copyToClipboard(which === 'host' ? record.host : record.value);
    if (!ok) return;
    setCopied(which);
    setTimeout(() => setCopied(null), 1500);
  }
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div>
        <div className="font-medium">{record.title}</div>
        <p className="text-xs text-muted-foreground">{record.hint}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-[4.5rem_1fr]">
        <div className="text-xs text-muted-foreground">Loại</div>
        <div className="font-mono text-sm">{record.type}</div>
        <div className="text-xs text-muted-foreground">Tên</div>
        <div className="flex items-center gap-1">
          <code className="flex-1 break-all rounded bg-muted px-2 py-1 text-xs">{record.host}</code>
          <Button type="button" size="sm" variant="ghost" onClick={() => void copy('host')}>
            {copied === 'host' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">Giá trị</div>
        <div className="flex items-center gap-1">
          <code className="flex-1 break-all rounded bg-muted px-2 py-1 text-xs">{record.value}</code>
          <Button type="button" size="sm" variant="ghost" onClick={() => void copy('value')}>
            {copied === 'value' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function EmailDomainsTab() {
  const t = useT();
  const domains = useEmailDomains();
  const createDomain = useCreateEmailDomain();
  const updateDomain = useUpdateEmailDomain();
  const checkDomain = useVerifyEmailDomain();
  const remove = useDeleteEmailDomain();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [domainInput, setDomainInput] = useState('');
  const [fromName, setFromName] = useState('');
  const [fromLocal, setFromLocal] = useState('hello');
  const [replyTo, setReplyTo] = useState('');
  const [current, setCurrent] = useState<EmailSenderDomain | null>(null);
  const [error, setError] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<EmailSenderDomain | null>(null);

  const domainHost = domainInput
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/^www\./, '');
  const fromEmail = fromLocal.trim() && domainHost ? `${fromLocal.trim().toLowerCase()}@${domainHost}` : '';
  const busy = createDomain.isPending || updateDomain.isPending || checkDomain.isPending;

  function resetWizard() {
    setStep(1);
    setDomainInput('');
    setFromName('');
    setFromLocal('hello');
    setReplyTo('');
    setCurrent(null);
    setError('');
  }

  function openNew() {
    resetWizard();
    setWizardOpen(true);
  }

  function openExisting(row: EmailSenderDomain) {
    setCurrent(row);
    setDomainInput(row.domain);
    setFromName(row.fromName);
    setFromLocal(row.fromEmail.split('@')[0] || 'hello');
    setReplyTo(row.replyTo || '');
    setStep(row.domainVerified ? 3 : 2);
    setError('');
    setWizardOpen(true);
  }

  async function submitInfo() {
    setError('');
    if (!domainHost || !fromName.trim() || !fromLocal.trim()) {
      setError('Điền tên miền, tên người gửi và email gửi.');
      return;
    }
    try {
      if (current) {
        const saved = await updateDomain.mutateAsync({
          id: current.id,
          fromName: fromName.trim(),
          fromEmail,
          replyTo: replyTo.trim() || null,
        });
        setCurrent(saved);
        setStep(2);
        return;
      }
      const created = await createDomain.mutateAsync({
        domain: domainHost,
        fromName: fromName.trim(),
        fromEmail,
        replyTo: replyTo.trim() || undefined,
      });
      setCurrent(created);
      setStep(2);
    } catch (err) {
      setError(errorMessage(err, t('emailMarketing.domainSaveFailed')));
    }
  }

  async function runCheck() {
    if (!current) return;
    setError('');
    try {
      const checked = await checkDomain.mutateAsync(current.id);
      setCurrent(checked);
      setStep(3);
    } catch (err) {
      setError(errorMessage(err, t('emailMarketing.domainSaveFailed')));
    }
  }

  useEffect(() => {
    if (!wizardOpen || step !== 3 || !current || current.domainVerified) return;
    const timer = window.setInterval(() => {
      void checkDomain.mutateAsync(current.id).then((row) => setCurrent(row));
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [wizardOpen, step, current?.id, current?.domainVerified, checkDomain, current]);

  async function saveEdit() {
    if (!editRow) return;
    setError('');
    try {
      const local = editRow.fromEmail.split('@')[0] || 'hello';
      await updateDomain.mutateAsync({
        id: editRow.id,
        fromName: editRow.fromName.trim(),
        fromEmail: `${local}@${editRow.domain}`,
        replyTo: editRow.replyTo?.trim() || null,
      });
      setEditRow(null);
    } catch (err) {
      setError(errorMessage(err, t('emailMarketing.domainSaveFailed')));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Thêm tên miền của spa để khách thấy email gửi từ thương hiệu của bạn. Chỉ cần làm theo 3 bước, không cần hiểu kỹ thuật.
        </p>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" /> Thêm tên miền
        </Button>
      </div>

      {domains.isLoading ? (
        <LoadingState />
      ) : domains.isError ? (
        <ErrorState onRetry={() => domains.refetch()} />
      ) : !domains.data?.length ? (
        <EmptyState title={t('emailMarketing.emptyDomains')} />
      ) : (
        <ul className="space-y-3">
          {domains.data.map((row) => (
            <li key={row.id} className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 font-medium">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    {row.domain}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {row.fromName} &lt;{row.fromEmail}&gt;
                    {row.replyTo ? ` · Trả lời về ${row.replyTo}` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">{DOMAIN_STATUS_LABELS[row.status]}</p>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" title="Tiếp tục" onClick={() => openExisting(row)}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" title="Tên người gửi" onClick={() => setEditRow({ ...row })}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" title="Xóa" onClick={() => setDeleteId(row.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Mark ok={row.dkimVerified} label="DKIM" />
                <Mark ok={row.spfVerified} label="SPF" />
                <Mark ok={row.dmarcVerified} label="DMARC" />
                <Mark ok={row.domainVerified} label="Domain Verified" />
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={wizardOpen}
        onOpenChange={(open) => {
          setWizardOpen(open);
          if (!open) resetWizard();
        }}
      >
        <DialogContent className="flex max-h-[92vh] max-w-2xl flex-col gap-4 overflow-hidden">
          <DialogHeader>
            <DialogTitle>Cấu hình tên miền gửi</DialogTitle>
            <DialogDescription>Làm lần lượt 3 bước. Có thể nhờ người giữ tên miền thêm bản ghi giúp bạn.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 text-xs">
            {STEPS.map((s) => (
              <div
                key={s.n}
                className={cn(
                  'flex-1 rounded-full px-2 py-1 text-center',
                  step === s.n ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                )}
              >
                {s.n}. {s.label}
              </div>
            ))}
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            {step === 1 && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Tên miền website</Label>
                  <Input
                    placeholder="spaabc.com"
                    value={domainInput}
                    onChange={(e) => setDomainInput(e.target.value)}
                    disabled={!!current}
                  />
                  <p className="text-xs text-muted-foreground">Không cần gõ https://. Ví dụ: spaabc.com</p>
                </div>
                <div className="space-y-1">
                  <Label>Tên người gửi</Label>
                  <Input
                    placeholder="Spa Hoa Sen"
                    value={fromName}
                    onChange={(e) => setFromName(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Tên khách thấy trong hộp thư, ví dụ: Spa Hoa Sen</p>
                </div>
                <div className="space-y-1">
                  <Label>Email gửi đi</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      className="max-w-[10rem]"
                      placeholder="hello"
                      value={fromLocal}
                      onChange={(e) => setFromLocal(e.target.value.replace(/@.*/g, ''))}
                    />
                    <span className="shrink-0 text-sm text-muted-foreground">@{domainHost || 'tendomain.com'}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Email nhận trả lời (không bắt buộc)</Label>
                  <Input
                    type="email"
                    placeholder="cskh@spaabc.com"
                    value={replyTo}
                    onChange={(e) => setReplyTo(e.target.value)}
                  />
                </div>
              </div>
            )}
            {step === 2 && current && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Đăng nhập nơi bạn mua tên miền (như Cloudflare, Nhà tên miền) → mục DNS → thêm từng dòng dưới đây. Sao
                  chép từng ô, không cần sửa.
                </p>
                {current.dnsRecords?.filter((r) => r.purpose === 'DKIM').length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Chữ ký email sẽ hiện sau khi hệ thống tạo xong. Bấm kiểm tra ở bước sau.
                  </p>
                ) : null}
                {(current.dnsRecords ?? []).map((record) => (
                  <DnsRow key={record.key} record={record} />
                ))}
              </div>
            )}
            {step === 3 && current && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Hệ thống tự kiểm tra. DNS đôi khi mất vài phút mới cập nhật — cứ để trang này mở, không cần làm gì thêm.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Mark ok={current.dkimVerified} label="DKIM" />
                  <Mark ok={current.spfVerified} label="SPF" />
                  <Mark ok={current.dmarcVerified} label="DMARC" />
                  <Mark ok={current.domainVerified} label="Domain Verified" />
                </div>
                {current.domainVerified && current.dkimVerified && current.spfVerified && current.dmarcVerified ? (
                  <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                    Hoàn tất. Chiến dịch email sẽ gửi với tên {current.fromName}.
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Nếu vẫn ❌ sau 10–15 phút, xem lại bản ghi DNS vừa thêm hoặc nhờ người giữ tên miền kiểm tra giúp.
                  </p>
                )}
              </div>
            )}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex items-center justify-between gap-2 border-t pt-3">
            {step > 1 ? (
              <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)} disabled={busy}>
                Quay lại
              </Button>
            ) : (
              <Button type="button" variant="ghost" onClick={() => setWizardOpen(false)}>
                Hủy
              </Button>
            )}
            {step === 1 && (
              <Button type="button" onClick={() => void submitInfo()} disabled={busy}>
                {busy ? 'Đang lưu…' : 'Tiếp tục'}
              </Button>
            )}
            {step === 2 && (
              <Button type="button" onClick={() => void runCheck()} disabled={busy}>
                {busy ? 'Đang kiểm tra…' : 'Đã thêm xong — kiểm tra'}
              </Button>
            )}
            {step === 3 && (
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => void runCheck()} disabled={busy}>
                  Kiểm tra lại
                </Button>
                <Button type="button" onClick={() => setWizardOpen(false)}>
                  Xong
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editRow} onOpenChange={(open) => !open && setEditRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tên người gửi</DialogTitle>
            <DialogDescription>Thay đổi tên và email khách nhìn thấy. Không đổi tên miền.</DialogDescription>
          </DialogHeader>
          {editRow && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Tên người gửi</Label>
                <Input
                  value={editRow.fromName}
                  onChange={(e) => setEditRow({ ...editRow, fromName: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Email gửi đi</Label>
                <div className="flex items-center gap-2">
                  <Input
                    className="max-w-[10rem]"
                    value={editRow.fromEmail.split('@')[0] || ''}
                    onChange={(e) =>
                      setEditRow({ ...editRow, fromEmail: `${e.target.value.replace(/@.*/g, '')}@${editRow.domain}` })
                    }
                  />
                  <span className="text-sm text-muted-foreground">@{editRow.domain}</span>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Email nhận trả lời</Label>
                <Input
                  value={editRow.replyTo || ''}
                  onChange={(e) => setEditRow({ ...editRow, replyTo: e.target.value })}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setEditRow(null)}>
                  Hủy
                </Button>
                <Button onClick={() => void saveEdit()} disabled={updateDomain.isPending}>
                  Lưu
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Xóa tên miền gửi?"
        destructive
        isPending={remove.isPending}
        onConfirm={() => {
          if (!deleteId) return;
          remove.mutate(deleteId, { onSuccess: () => setDeleteId(null) });
        }}
      />
    </div>
  );
}
