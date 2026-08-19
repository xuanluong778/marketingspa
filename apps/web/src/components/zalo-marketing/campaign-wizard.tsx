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
  useStartZaloCampaign,
  useUpdateZaloCampaign,
  useZaloOas,
  useZaloTemplates,
} from '@/hooks/use-zalo-marketing';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type Step = 'kind' | 'oa' | 'audience' | 'content' | 'preview';

export function ZaloCampaignWizard({ open, onOpenChange }: Props) {
  const oas = useZaloOas();
  const [step, setStep] = useState<Step>('kind');
  const [kind, setKind] = useState<'TEMPLATE' | 'BROADCAST'>('TEMPLATE');
  const [oaId, setOaId] = useState('');
  const [zbsId, setZbsId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [segmentMode, setSegmentMode] = useState<'all_followers' | 'import'>('all_followers');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [segmentConfig, setSegmentConfig] = useState<Record<string, unknown>>({ requireOptIn: true, excludeSuppressed: true });
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<Array<{ displayName?: string | null; phone?: string | null; rendered?: string }>>([]);
  const [audienceSummary, setAudienceSummary] = useState<{ total?: number; suppressed?: number } | null>(null);

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

  const selectedTemplate = (templates.data ?? []).find((t) => t.id === templateId);

  function reset() {
    setStep('kind');
    setKind('TEMPLATE');
    setOaId('');
    setZbsId('');
    setTemplateId('');
    setName('');
    setBody('');
    setSegmentMode('all_followers');
    setImportFile(null);
    setSegmentConfig({ requireOptIn: true, excludeSuppressed: true, followStatuses: ['FOLLOWING'] });
    setVariables({});
    setCampaignId(null);
    setPreviewRows([]);
    setAudienceSummary(null);
  }

  async function handleAudienceNext() {
    if (!oaId) return;
    let nextSegment = { ...segmentConfig, followStatuses: ['FOLLOWING'], requireOptIn: true, excludeSuppressed: true };
    if (segmentMode === 'import' && importFile) {
      const imported = await importAudience.mutateAsync({ connectionId: oaId, file: importFile });
      nextSegment = imported.segmentConfig as Record<string, unknown>;
      setSegmentConfig(nextSegment);
    } else {
      nextSegment = {
        ...nextSegment,
        followStatuses: ['FOLLOWING'],
      };
      setSegmentConfig(nextSegment);
    }
    const preview = await previewAudience.mutateAsync({
      channelConnectionId: oaId,
      campaignType: kind,
      segmentConfig: nextSegment,
    });
    setAudienceSummary({ total: preview.total, suppressed: preview.suppressed });
    setStep('content');
  }

  async function saveDraftAndGetId(): Promise<string> {
    const payload = {
      name: name || `Zalo ${kind === 'TEMPLATE' ? 'ZBS' : 'Broadcast'} ${new Date().toLocaleDateString('vi-VN')}`,
      campaignType: kind,
      channelConnectionId: oaId,
      zbsConnectionId: kind === 'TEMPLATE' ? zbsId || undefined : undefined,
      messageTemplateId: kind === 'TEMPLATE' ? templateId : undefined,
      segmentConfig,
      variables: {
        ...variables,
        ...(kind === 'BROADCAST' ? { body, message: body } : {}),
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

  async function handleSend() {
    const id = await saveDraftAndGetId();
    await start.mutateAsync(id);
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
          <DialogTitle>Tạo chiến dịch Zalo</DialogTitle>
        </DialogHeader>

        {step === 'kind' && (
          <div className="space-y-3">
            <Label>Loại chiến dịch</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button variant={kind === 'TEMPLATE' ? 'default' : 'outline'} onClick={() => setKind('TEMPLATE')}>
                ZBS Template
              </Button>
              <Button variant={kind === 'BROADCAST' ? 'default' : 'outline'} onClick={() => setKind('BROADCAST')}>
                Broadcast OA
              </Button>
            </div>
          </div>
        )}

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
                <Label>Kết nối ZBS (template)</Label>
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
              </>
            )}
          </div>
        )}

        {step === 'audience' && (
          <div className="space-y-3">
            <Label>Chọn khách</Label>
            <Select value={segmentMode} onValueChange={(v) => setSegmentMode(v as typeof segmentMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all_followers">Follower OA (đủ điều kiện)</SelectItem>
                <SelectItem value="import">Import CSV/XLSX (SĐT/UID)</SelectItem>
              </SelectContent>
            </Select>
            {segmentMode === 'import' && (
              <Input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} />
            )}
            {audienceSummary && (
              <p className="text-sm text-muted-foreground">
                Dự kiến: {audienceSummary.total} khách, loại trừ {audienceSummary.suppressed}
              </p>
            )}
          </div>
        )}

        {step === 'content' && (
          <div className="space-y-3">
            <Label>Tên chiến dịch</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Flash sale tháng 8" />
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
                <Label>Nội dung Broadcast</Label>
                <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
              </>
            )}
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Xem trước với dữ liệu thực tế (tối đa 5 mẫu)</p>
            {previewRows.length === 0 ? (
              <p className="text-sm">Chưa có mẫu preview.</p>
            ) : (
              previewRows.map((row, idx) => (
                <div key={idx} className="rounded border p-3 text-sm">
                  <div className="font-medium">{row.displayName || row.phone || 'Khách'}</div>
                  <pre className="mt-2 whitespace-pre-wrap text-muted-foreground">{row.rendered}</pre>
                </div>
              ))
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-2">
            {step !== 'kind' && (
              <Button
                variant="outline"
                onClick={() =>
                  setStep(
                    step === 'oa'
                      ? 'kind'
                      : step === 'audience'
                        ? 'oa'
                        : step === 'content'
                          ? 'audience'
                          : 'content',
                  )
                }
              >
                Quay lại
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {step === 'kind' && <Button onClick={() => setStep('oa')}>Tiếp</Button>}
            {step === 'oa' && (
              <Button disabled={!oaId || (kind === 'TEMPLATE' && !zbsId)} onClick={() => setStep('audience')}>
                Tiếp
              </Button>
            )}
            {step === 'audience' && (
              <Button disabled={previewAudience.isPending || importAudience.isPending} onClick={() => void handleAudienceNext()}>
                Tiếp
              </Button>
            )}
            {step === 'content' && (
              <Button disabled={create.isPending || update.isPending} onClick={() => void handlePreview()}>
                Preview
              </Button>
            )}
            {step === 'preview' && (
              <Button disabled={start.isPending} onClick={() => void handleSend()}>
                Gửi chiến dịch
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
