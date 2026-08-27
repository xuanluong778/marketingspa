'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, FileText, PenLine, Search, Users } from 'lucide-react';
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
  useEmailAudienceMembers,
  useEmailAudiencePreview,
  useEmailDomains,
  useEmailLists,
  useEmailTemplates,
  useScheduleEmailCampaign,
  useSendEmailCampaign,
} from '@/hooks/use-email-marketing';
import type { EmailAudienceMember, EmailTemplate } from '@/types/email-marketing';
import { ApiError, apiClient } from '@/lib/api-client';
import type { PaginatedResult } from '@/types/api';
import {
  compileEmailHtml,
  defaultEmailBlocks,
  parseEmailHtml,
  type EmailBlock,
} from '@/lib/email-editor';
import { useT } from '@/i18n/i18n-provider';

const STEPS = [
  { n: 1, label: 'Người nhận' },
  { n: 2, label: 'Mẫu email' },
  { n: 3, label: 'Xem trước' },
  { n: 4, label: 'Gửi' },
] as const;

const ICT = 'Asia/Ho_Chi_Minh';
const PAGE_SIZE = 20;
/** API PaginationDto @Max(100) — must not request larger pageSize */
const SELECT_ALL_PAGE_SIZE = 100;

async function fetchAllEligibleMembers(opts: {
  listId?: string;
  search?: string;
}): Promise<EmailAudienceMember[]> {
  const all: EmailAudienceMember[] = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages) {
    const qs = new URLSearchParams({
      filter: 'eligible',
      page: String(page),
      pageSize: String(SELECT_ALL_PAGE_SIZE),
    });
    if (opts.listId) qs.set('listId', opts.listId);
    if (opts.search?.trim()) qs.set('search', opts.search.trim());
    const res = await apiClient<PaginatedResult<EmailAudienceMember>>(
      `/email-marketing/audience-members?${qs}`,
    );
    all.push(...(res.items ?? []));
    totalPages = Math.max(1, res.totalPages || 1);
    if (!(res.items?.length)) break;
    page += 1;
    if (page > 200) break; // hard safety
  }
  return all;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** datetime-local value in Asia/Ho_Chi_Minh */
function defaultScheduleValue() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ICT,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/** Interpret datetime-local as Asia/Ho_Chi_Minh → ISO UTC */
function ictLocalToIso(local: string) {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return new Date(local).toISOString();
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+07:00`).toISOString();
}

function errorMessage(err: unknown, fallback: string) {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

type AudienceChoice = 'all' | string;

function RecipientTable({
  items,
  selectedIds,
  onToggle,
  loading,
}: {
  items: EmailAudienceMember[];
  selectedIds: Set<string>;
  onToggle: (id: string, next: boolean) => void;
  loading?: boolean;
}) {
  const t = useT();
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="w-10 px-2 py-2" />
            <th className="px-2 py-2 font-medium">{t('common.name')}</th>
            <th className="px-2 py-2 font-medium">{t('common.email')}</th>
            <th className="px-2 py-2 font-medium">{t('emailMarketing.source')}</th>
            <th className="px-2 py-2 font-medium">{t('common.status')}</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                {t('emailMarketing.loadingLists')}
              </td>
            </tr>
          )}
          {!loading && items.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                {t('common.noData')}
              </td>
            </tr>
          )}
          {!loading &&
            items.map((m) => {
              const sourceGroup = [m.source, ...(m.groups ?? [])].filter(Boolean).join(' · ') || '—';
              return (
                <tr key={m.id} className="border-b last:border-0">
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(m.id)}
                      onChange={(e) => onToggle(m.id, e.target.checked)}
                      aria-label={`Chọn ${m.email}`}
                    />
                  </td>
                  <td className="px-2 py-2">{m.name || '—'}</td>
                  <td className="px-2 py-2 font-mono text-xs">{m.email}</td>
                  <td className="max-w-[180px] truncate px-2 py-2 text-muted-foreground">
                    {sourceGroup}
                  </td>
                  <td className="px-2 py-2">{m.statusLabel}</td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}

export function EmailCampaignWizard({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const lists = useEmailLists({ pageSize: '50' });
  const senderDomains = useEmailDomains();
  const templatesQuery = useEmailTemplates({ pageSize: '50' });
  const createTemplate = useCreateEmailTemplate();
  const createCampaign = useCreateEmailCampaign();
  const sendCampaign = useSendEmailCampaign();
  const scheduleCampaign = useScheduleEmailCampaign();

  const [step, setStep] = useState(1);
  /** Highest step the user has reached — allows jumping back without losing setup. */
  const [maxReached, setMaxReached] = useState(1);
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
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [selectedCache, setSelectedCache] = useState<Map<string, EmailAudienceMember>>(
    () => new Map(),
  );
  const [selectingAll, setSelectingAll] = useState(false);

  const listId = audience && audience !== 'all' ? audience : undefined;
  const allPreview = useEmailAudiencePreview(undefined, open);
  const listPreview = useEmailAudiencePreview(listId, open && Boolean(listId));
  const preview = listId ? listPreview : allPreview;

  const membersQuery = useEmailAudienceMembers(
    {
      listId,
      search: search || undefined,
      page: String(page),
      pageSize: String(PAGE_SIZE),
      filter: 'eligible',
    },
    open && audience !== null,
  );

  const templates = (templatesQuery.data?.items ?? []).filter((t) => t.category !== 'campaign');
  const groups = lists.data?.items ?? [];
  const eligible = audience === null ? 0 : (preview.data?.eligible ?? 0);
  const selectedCount = selectedIds.size;
  const verifiedSenders = (senderDomains.data ?? []).filter((d) => d.domainVerified);

  const audienceLabel =
    audience === 'all'
      ? 'Tất cả đang nhận email'
      : groups.find((g) => g.id === audience)?.name || 'Nhóm';

  const memberItems = membersQuery.data?.items ?? [];
  const memberTotal = membersQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(memberTotal / PAGE_SIZE));

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setMaxReached(1);
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
    setSearch('');
    setSearchInput('');
    setPage(1);
    setSelectedIds(new Set());
    setSelectedCache(new Map());
  }, [open]);

  // Only re-seed selection when audience *choice* changes — not when navigating Quay lại.
  useEffect(() => {
    if (audience === null) return;
    setSearch('');
    setSearchInput('');
    setPage(1);
    setSelectedIds(new Set());
    setSelectedCache(new Map());
    let cancelled = false;
    (async () => {
      try {
        const items = await fetchAllEligibleMembers({ listId });
        if (cancelled) return;
        setSelectedIds(new Set(items.map((i) => i.id)));
        setSelectedCache(new Map(items.map((m) => [m.id, m])));
      } catch {
        /* user can still Chọn tất cả */
      }
    })();
    return () => {
      cancelled = true;
    };
    // intentionally only audience (listId is derived from it)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience]);

  function goNext() {
    if (!canNext || busy) return;
    setError(null);
    const next = Math.min(4, step + 1);
    setMaxReached((m) => Math.max(m, next));
    setStep(next);
  }

  function goBack() {
    if (busy || step <= 1) return;
    setError(null);
    setStep((s) => Math.max(1, s - 1));
  }

  useEffect(() => {
    if (!memberItems.length) return;
    setSelectedCache((prev) => {
      const next = new Map(prev);
      for (const m of memberItems) next.set(m.id, m);
      return next;
    });
  }, [memberItems]);

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

  function toggleOne(id: string, next: boolean) {
    setSelectedIds((prev) => {
      const s = new Set(prev);
      if (next) s.add(id);
      else s.delete(id);
      return s;
    });
  }

  async function selectAllEligible() {
    setSelectingAll(true);
    setError(null);
    try {
      const items = await fetchAllEligibleMembers({
        listId,
        search: search || undefined,
      });
      setSelectedIds(new Set(items.map((i) => i.id)));
      setSelectedCache((prev) => {
        const next = new Map(prev);
        for (const m of items) next.set(m.id, m);
        return next;
      });
    } catch (err) {
      setError(errorMessage(err, t('emailMarketing.createFailed')));
    } finally {
      setSelectingAll(false);
    }
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  const canNext = useMemo(() => {
    if (step === 1) return audience !== null && selectedCount > 0 && !membersQuery.isLoading;
    if (step === 2) return templateId !== null;
    if (step === 3) return Boolean(name.trim() && subject.trim() && blocks.length > 0);
    return true;
  }, [step, audience, selectedCount, membersQuery.isLoading, templateId, name, subject, blocks]);

  const busy =
    createTemplate.isPending ||
    createCampaign.isPending ||
    sendCampaign.isPending ||
    scheduleCampaign.isPending;

  function goToStep(n: number) {
    if (busy) return;
    if (n < 1 || n > 4) return;
    if (n > maxReached) return;
    setError(null);
    setStep(n);
  }

  const selectedPreviewRows = useMemo(() => {
    const rows: EmailAudienceMember[] = [];
    for (const id of selectedIds) {
      const m = selectedCache.get(id);
      if (m) rows.push(m);
    }
    return rows.sort((a, b) => a.email.localeCompare(b.email));
  }, [selectedIds, selectedCache]);

  async function finish() {
    setError(null);
    if (selectedCount < 1) {
      setError('Chọn ít nhất một người nhận.');
      return;
    }
    if (sendMode === 'later') {
      const when = new Date(ictLocalToIso(scheduledAt));
      if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now() + 60_000) {
        setError('Chọn thời điểm gửi ít nhất 1 phút nữa (múi giờ Asia/Ho_Chi_Minh).');
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
        contactIds: Array.from(selectedIds),
      });
      if (sendMode === 'now') {
        await sendCampaign.mutateAsync(campaign.id);
      } else {
        await scheduleCampaign.mutateAsync({
          id: campaign.id,
          scheduledAt: ictLocalToIso(scheduledAt),
        });
      }
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err, t('emailMarketing.createFailed')));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-5xl flex-col gap-4 overflow-hidden">
        <DialogHeader>
          <DialogTitle>Tạo chiến dịch email</DialogTitle>
        </DialogHeader>

        <ol className="flex gap-2">
          {STEPS.map((s) => {
            const reached = s.n <= maxReached;
            const isCurrent = s.n === step;
            const canJump = reached && !isCurrent && !busy;
            return (
              <li key={s.n} className="min-w-0 flex-1">
                <button
                  type="button"
                  disabled={!canJump && !isCurrent}
                  onClick={() => goToStep(s.n)}
                  title={
                    canJump
                      ? `Quay lại bước ${s.label}`
                      : isCurrent
                        ? `Đang ở bước ${s.label}`
                        : 'Hoàn thành bước trước để mở'
                  }
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs sm:text-sm',
                    isCurrent
                      ? 'border-primary bg-primary/10 font-medium'
                      : reached
                        ? 'border-primary/40 text-muted-foreground hover:bg-muted/50 cursor-pointer'
                        : 'text-muted-foreground opacity-60 cursor-not-allowed',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs',
                      isCurrent || reached
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted',
                    )}
                  >
                    {reached && !isCurrent ? <Check className="h-3.5 w-3.5" /> : s.n}
                  </span>
                  <span className="truncate">{s.label}</span>
                </button>
              </li>
            );
          })}
        </ol>

        {preview.data && audience !== null && (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            Đã chọn <strong>{selectedCount}</strong> / {preview.data.eligible} người hợp lệ
            {preview.data.skippedUnsubscribed + preview.data.skippedSuppressed > 0
              ? ` (đã loại ${preview.data.skippedUnsubscribed + preview.data.skippedSuppressed} invalid / unsubscribed / bounce / complaint / suppression)`
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
                  {t('emailMarketing.emptyGroups')}
                </p>
              )}
              {audience !== null && !preview.isLoading && eligible === 0 && (
                <p className="text-sm text-destructive">
                  {t('emailMarketing.emptyRecipientsValid')}
                </p>
              )}

              {audience !== null && eligible > 0 && (
                <div className="space-y-2 pt-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative min-w-[200px] flex-1">
                      <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        className="pl-8"
                        placeholder="Tìm tên hoặc email…"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            setPage(1);
                            setSearch(searchInput.trim());
                          }
                        }}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setPage(1);
                        setSearch(searchInput.trim());
                      }}
                    >
                      Tìm
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={selectingAll}
                      onClick={() => void selectAllEligible()}
                    >
                      {selectingAll ? 'Đang chọn…' : 'Chọn tất cả'}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={clearSelection}>
                      Bỏ chọn
                    </Button>
                  </div>
                  <RecipientTable
                    items={memberItems}
                    selectedIds={selectedIds}
                    onToggle={toggleOne}
                    loading={membersQuery.isLoading}
                  />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      Trang {page}/{totalPages} · {memberTotal} người (đã lọc suppression)
                    </span>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        Trước
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      >
                        Sau
                      </Button>
                    </div>
                  </div>
                </div>
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
                    {audienceLabel} · {selectedCount} người đã chọn
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Tiêu đề</span>
                  <span className="font-medium">{subject}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Danh sách người nhận đã chọn ({selectedCount})</Label>
                <RecipientTable
                  items={selectedPreviewRows.slice(0, 50)}
                  selectedIds={selectedIds}
                  onToggle={toggleOne}
                />
                {selectedCount > 50 && (
                  <p className="text-xs text-muted-foreground">
                    Hiển thị 50/{selectedCount}. Toàn bộ danh sách đã chọn vẫn được gửi.
                  </p>
                )}
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
                  <span className="block font-medium">Hẹn giờ</span>
                  <span className="text-sm text-muted-foreground">
                    Chọn ngày + giờ (Asia/Ho_Chi_Minh)
                  </span>
                </button>
              </div>
              {sendMode === 'later' && (
                <div className="space-y-1">
                  <Label>Ngày + Giờ gửi (Asia/Ho_Chi_Minh)</Label>
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

        <div className="flex shrink-0 items-center justify-between gap-2 border-t pt-3">
          {step > 1 ? (
            <Button type="button" variant="outline" onClick={goBack} disabled={busy}>
              <ChevronLeft className="mr-1 h-4 w-4" /> Quay lại
            </Button>
          ) : (
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
          )}
          {step < 4 ? (
            <Button type="button" onClick={goNext} disabled={!canNext || busy}>
              Tiếp tục
            </Button>
          ) : (
            <Button type="button" onClick={() => void finish()} disabled={busy || selectedCount < 1}>
              {busy
                ? 'Đang xử lý…'
                : sendMode === 'now'
                  ? `Gửi cho ${selectedCount} người`
                  : `Hẹn giờ gửi ${selectedCount} người`}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
