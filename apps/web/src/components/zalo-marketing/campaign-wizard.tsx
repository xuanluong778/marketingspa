'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { Badge } from '@/components/ui/badge';
import {
  useCreateZaloCampaign,
  useImportZaloAudience,
  usePreviewZaloAudience,
  usePreviewZaloCampaign,
  useScheduleZaloCampaign,
  useStartZaloCampaign,
  useUpdateZaloCampaign,
  useZaloOas,
  useZaloTemplates,
} from '@/hooks/use-zalo-marketing';
import { useT } from '@/i18n/i18n-provider';

export type ZaloCampaignMode = 'BROADCAST' | 'TRANSACTIONAL' | 'TEMPLATE';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lockedMode: ZaloCampaignMode;
};

type Step = 'oa' | 'audience' | 'content' | 'preview';

const MODE_LABEL: Record<ZaloCampaignMode, string> = {
  BROADCAST: 'Broadcast',
  TRANSACTIONAL: 'Tin Tư vấn',
  TEMPLATE: 'ZBS Template',
};

const MODE_CONDITION: Record<ZaloCampaignMode, string> = {
  BROADCAST: 'Chỉ người đang Quan tâm OA · API promotion · kiểm tra quota',
  TRANSACTIONAL: 'Chỉ user tương tác/opt-in trong 48h · API message/cs',
  TEMPLATE: 'Template ZBS đã duyệt · gửi UID/SĐT · hiển thị chi phí nếu có',
};

export function ZaloCampaignWizard({ open, onOpenChange, lockedMode }: Props) {
  const t = useT();
  const kind = lockedMode;
  const oas = useZaloOas();
  const [step, setStep] = useState<Step>('oa');
  const [oaId, setOaId] = useState('');
  const [zbsId, setZbsId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [ctaTitle, setCtaTitle] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [segmentMode, setSegmentMode] = useState<'all_followers' | 'import'>('all_followers');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [segmentConfig, setSegmentConfig] = useState<Record<string, unknown>>({
    requireOptIn: kind !== 'BROADCAST',
    excludeSuppressed: true,
    followStatuses: kind === 'BROADCAST' ? ['FOLLOWING'] : undefined,
  });
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<
    Array<{ displayName?: string | null; phone?: string | null; rendered?: string }>
  >([]);
  const [audienceSummary, setAudienceSummary] = useState<{
    total?: number;
    suppressed?: number;
    eligible?: number;
    ineligible?: number;
    estimatedCost?: number;
    conditions?: string;
    oaName?: string;
  } | null>(null);
  const [scheduledAt, setScheduledAt] = useState('');

  const zaloOas = useMemo(
    () => (oas.data ?? []).filter((c) => c.providerKind === 'ZALO_OA' && !c.isPaused),
    [oas.data],
  );
  const zbsConnections = useMemo(
    () => (oas.data ?? []).filter((c) => c.providerKind === 'ZBS_TEMPLATE' && !c.isPaused),
    [oas.data],
  );
  const templates = useZaloTemplates(zbsId || undefined);
  const create = useCreateZaloCampaign();
  const update = useUpdateZaloCampaign();
  const previewAudience = usePreviewZaloAudience();
  const previewCampaign = usePreviewZaloCampaign();
  const importAudience = useImportZaloAudience();
  const start = useStartZaloCampaign();
  const schedule = useScheduleZaloCampaign();

  const selectedOa = zaloOas.find((o) => o.id === oaId);

  function reset() {
    setStep('oa');
    setOaId('');
    setZbsId('');
    setTemplateId('');
    setName('');
    setBody('');
    setMediaUrl('');
    setCtaTitle('');
    setCtaUrl('');
    setSegmentMode('all_followers');
    setImportFile(null);
    setSegmentConfig({
      requireOptIn: kind !== 'BROADCAST',
      excludeSuppressed: true,
      followStatuses: kind === 'BROADCAST' ? ['FOLLOWING'] : undefined,
    });
    setVariables({});
    setCampaignId(null);
    setPreviewRows([]);
    setAudienceSummary(null);
    setScheduledAt('');
  }

  async function handleAudienceNext() {
    if (!oaId) return;
    let nextSegment: Record<string, unknown> = {
      ...segmentConfig,
      excludeSuppressed: true,
      requireOptIn: kind !== 'BROADCAST',
      ...(kind === 'BROADCAST' ? { followStatuses: ['FOLLOWING'] } : {}),
    };
    if (segmentMode === 'import' && importFile) {
      const imported = await importAudience.mutateAsync({ connectionId: oaId, file: importFile });
      nextSegment = imported.segmentConfig as Record<string, unknown>;
      setSegmentConfig(nextSegment);
    } else {
      setSegmentConfig(nextSegment);
    }
    const preview = (await previewAudience.mutateAsync({
      channelConnectionId: oaId,
      campaignType: kind,
      segmentConfig: nextSegment,
    })) as {
      total?: number;
      suppressed?: number;
      eligible?: number;
      ineligible?: number;
      estimatedCost?: number;
      conditions?: string;
      oa?: { displayName?: string | null; accountRef?: string };
    };
    setAudienceSummary({
      total: preview.total,
      suppressed: preview.suppressed,
      eligible: preview.eligible,
      ineligible: preview.ineligible,
      estimatedCost: preview.estimatedCost,
      conditions: preview.conditions ?? MODE_CONDITION[kind],
      oaName: preview.oa?.displayName || preview.oa?.accountRef || selectedOa?.displayName || '',
    });
    setStep('content');
  }

  async function saveDraftAndGetId(): Promise<string> {
    const payload = {
      name: name || `Zalo ${MODE_LABEL[kind]} ${new Date().toLocaleDateString('vi-VN')}`,
      campaignType: kind,
      channelConnectionId: oaId,
      zbsConnectionId: kind === 'TEMPLATE' ? zbsId || undefined : undefined,
      messageTemplateId: kind === 'TEMPLATE' ? templateId : undefined,
      segmentConfig,
      variables: {
        ...variables,
        ...(kind !== 'TEMPLATE'
          ? {
              body,
              message: body,
              ...(mediaUrl ? { mediaUrl, mediaType: 'image' } : {}),
              ...(ctaTitle ? { ctaTitle } : {}),
              ...(ctaUrl ? { ctaUrl } : {}),
            }
          : {}),
      },
    };
    if (campaignId) {
      await update.mutateAsync({ id: campaignId, ...payload });
      return campaignId;
    }
    const created = (await create.mutateAsync(payload)) as { id: string };
    setCampaignId(created.id);
    return created.id;
  }

  async function handlePreview() {
    const id = await saveDraftAndGetId();
    const res = await previewCampaign.mutateAsync({ id });
    setPreviewRows((res as { samples?: typeof previewRows }).samples ?? []);
    setStep('preview');
  }

  async function handleSendNow() {
    const id = await saveDraftAndGetId();
    await start.mutateAsync(id);
    onOpenChange(false);
    reset();
  }

  async function handleSchedule() {
    if (!scheduledAt) return;
    const id = await saveDraftAndGetId();
    await schedule.mutateAsync({ id, scheduledAt: new Date(scheduledAt).toISOString() });
    onOpenChange(false);
    reset();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tạo {MODE_LABEL[kind]}</DialogTitle>
        </DialogHeader>

        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          <div className="grid gap-1 sm:grid-cols-2">
            <p>
              <span className="text-muted-foreground">Gửi cho ai:</span>{' '}
              {kind === 'BROADCAST'
                ? 'Follower đang Quan tâm'
                : kind === 'TRANSACTIONAL'
                  ? 'User trong cửa sổ tư vấn'
                  : 'UID / SĐT đủ điều kiện'}
            </p>
            <p>
              <span className="text-muted-foreground">Điều kiện:</span> {MODE_CONDITION[kind]}
            </p>
            <p>
              <span className="text-muted-foreground">OA đang dùng:</span>{' '}
              {audienceSummary?.oaName || selectedOa?.displayName || selectedOa?.accountRef || '—'}
            </p>
            <p>
              <span className="text-muted-foreground">Số người hợp lệ:</span>{' '}
              {audienceSummary?.eligible ?? '—'}
            </p>
            <p>
              <span className="text-muted-foreground">Không hợp lệ:</span>{' '}
              {audienceSummary?.ineligible ?? '—'}
            </p>
            <p>
              <span className="text-muted-foreground">Chi phí dự kiến:</span>{' '}
              {audienceSummary?.estimatedCost != null
                ? `${audienceSummary.estimatedCost.toLocaleString('vi-VN')} đ`
                : '—'}
            </p>
          </div>
        </div>

        {step === 'oa' && (
          <div className="space-y-3">
            <Label>Chọn OA gửi</Label>
            <Select value={oaId} onValueChange={setOaId}>
              <SelectTrigger>
                <SelectValue placeholder="Chọn Official Account" />
              </SelectTrigger>
              <SelectContent>
                {zaloOas.map((oa) => (
                  <SelectItem key={oa.id} value={oa.id}>
                    {oa.displayName || oa.accountRef}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {kind === 'TEMPLATE' && (
              <>
                <Label>Kết nối ZBS</Label>
                <Select value={zbsId} onValueChange={setZbsId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn kết nối ZBS" />
                  </SelectTrigger>
                  <SelectContent>
                    {zbsConnections.map((z) => (
                      <SelectItem key={z.id} value={z.id}>
                        {z.displayName || z.accountRef}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {zbsConnections.length === 0 && (
                  <p className="text-sm text-amber-700">
                    {t('zalo.noZbsConnect')}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {step === 'audience' && (
          <div className="space-y-3">
            <Label>Chọn khách</Label>
            <Select
              value={segmentMode}
              onValueChange={(v) => setSegmentMode(v as typeof segmentMode)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all_followers">
                  {kind === 'BROADCAST'
                    ? 'Toàn bộ follower Quan tâm'
                    : kind === 'TRANSACTIONAL'
                      ? 'Khách đủ cửa sổ tư vấn'
                      : 'Khách OA / CRM đã map'}
                </SelectItem>
                <SelectItem value="import">Import CSV/XLSX (SĐT/UID)</SelectItem>
              </SelectContent>
            </Select>
            {segmentMode === 'import' && (
              <Input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
              />
            )}
          </div>
        )}

        {step === 'content' && (
          <div className="space-y-3">
            <Label>Tên chiến dịch</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Flash sale tháng 8"
            />
            {kind === 'TEMPLATE' ? (
              <>
                <Label>Mẫu ZBS đã duyệt</Label>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn template" />
                  </SelectTrigger>
                  <SelectContent>
                    {(templates.data ?? [])
                      .filter((t) => t.approvalStatus === 'APPROVED' || t.isActive)
                      .map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}{' '}
                          <Badge variant="outline" className="ml-1">
                            {t.approvalStatus}
                          </Badge>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Label>Biến template (JSON)</Label>
                <Textarea
                  rows={4}
                  value={JSON.stringify(variables, null, 2)}
                  onChange={(e) => {
                    try {
                      setVariables(JSON.parse(e.target.value) as Record<string, string>);
                    } catch {
                      /* ignore while typing */
                    }
                  }}
                  placeholder='{"name":"Anh A","phone":"090...","order_code":"DH001","voucher":"SALE10"}'
                />
              </>
            ) : (
              <>
                <Label>Nội dung</Label>
                <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
                {kind === 'BROADCAST' && (
                  <>
                    <Label>Ảnh (URL HTTPS, tùy chọn)</Label>
                    <Input
                      value={mediaUrl}
                      onChange={(e) => setMediaUrl(e.target.value)}
                      placeholder="https://..."
                    />
                    <Label>CTA (tùy chọn)</Label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input
                        value={ctaTitle}
                        onChange={(e) => setCtaTitle(e.target.value)}
                        placeholder="Nhãn nút"
                      />
                      <Input
                        value={ctaUrl}
                        onChange={(e) => setCtaUrl(e.target.value)}
                        placeholder="https://..."
                      />
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Xem trước (tối đa 5 mẫu) — chưa gửi thật</p>
            {previewRows.length === 0 ? (
              <p className="text-sm">{t('zalo.noPreviewTemplate')}</p>
            ) : (
              previewRows.map((row, idx) => (
                <div key={idx} className="rounded border p-3 text-sm">
                  <div className="font-medium">{row.displayName || row.phone || 'Khách'}</div>
                  <pre className="mt-2 whitespace-pre-wrap text-muted-foreground">{row.rendered}</pre>
                </div>
              ))
            )}
            <div className="space-y-2 rounded border p-3">
              <Label>Hẹn giờ (tùy chọn)</Label>
              <Input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-2">
            {step !== 'oa' && (
              <Button
                variant="outline"
                onClick={() =>
                  setStep(
                    step === 'audience' ? 'oa' : step === 'content' ? 'audience' : 'content',
                  )
                }
              >
                Quay lại
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {step === 'oa' && (
              <Button
                disabled={!oaId || (kind === 'TEMPLATE' && !zbsId)}
                onClick={() => setStep('audience')}
              >
                Tiếp
              </Button>
            )}
            {step === 'audience' && (
              <Button
                disabled={previewAudience.isPending || importAudience.isPending}
                onClick={() => void handleAudienceNext()}
              >
                Tiếp
              </Button>
            )}
            {step === 'content' && (
              <Button
                disabled={
                  create.isPending ||
                  update.isPending ||
                  (kind === 'TEMPLATE' ? !templateId : !body.trim())
                }
                onClick={() => void handlePreview()}
              >
                Preview
              </Button>
            )}
            {step === 'preview' && (
              <>
                <Button
                  variant="outline"
                  disabled={!scheduledAt || schedule.isPending}
                  onClick={() => void handleSchedule()}
                >
                  Hẹn giờ
                </Button>
                <Button disabled={start.isPending} onClick={() => void handleSendNow()}>
                  Gửi ngay
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
