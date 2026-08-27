'use client';

import { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useGoogleAdsCampaignBuilderDrafts,
  useGoogleAdsCampaignBuilderMutations,
  useGoogleAdsLinkedAccounts,
} from '@/hooks/use-ai-ads-manager';
import { useT } from '@/i18n/i18n-provider';

function money(n: number, currency: string) {
  return `${new Intl.NumberFormat('vi-VN').format(Math.round(n))} ${currency}`;
}

export function GoogleAdsCampaignBuilder() {
  const t = useT();
  const accounts = useGoogleAdsLinkedAccounts();
  const drafts = useGoogleAdsCampaignBuilderDrafts();
  const m = useGoogleAdsCampaignBuilderMutations();
  const selected = (accounts.data?.items ?? []).filter((a) => a.isSelected);
  const [customerId, setCustomerId] = useState('');
  const [product, setProduct] = useState('');
  const [landingPage, setLandingPage] = useState('https://');
  const [objective, setObjective] = useState('Thu lead đặt lịch');
  const [location, setLocation] = useState('Việt Nam');
  const [audience, setAudience] = useState(t('aiAds.defaultAudience'));
  const [dailyBudget, setDailyBudget] = useState('200000');
  const [activeId, setActiveId] = useState<string | null>(null);

  const active = useMemo(
    () => (drafts.data?.items ?? []).find((d) => d.id === activeId) ?? drafts.data?.items?.[0],
    [drafts.data, activeId],
  );

  const picked =
    selected.find((a) => a.customerId === customerId) ?? selected[0] ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" /> Google Ads AI — tự tạo chiến dịch
        </CardTitle>
        <CardDescription>
          Chọn tài khoản → nhập brief → AI soạn draft → xem trước ngân sách → bạn xác nhận mới chạy
          quảng cáo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Tài khoản Google Ads</Label>
            <Select
              value={picked?.customerId ?? ''}
              onValueChange={setCustomerId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Chọn tài khoản đã kết nối" />
              </SelectTrigger>
              <SelectContent>
                {selected.map((a) => (
                  <SelectItem key={a.customerId} value={a.customerId}>
                    {a.name || a.customerId} ({a.customerId})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Sản phẩm / dịch vụ</Label>
            <Input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="VD: chăm sóc da mặt" />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Website / Landing page</Label>
            <Input value={landingPage} onChange={(e) => setLandingPage(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Mục tiêu</Label>
            <Input value={objective} onChange={(e) => setObjective(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Khu vực</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>{t('aiAds.targetCustomers')}</Label>
            <Textarea value={audience} onChange={(e) => setAudience(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1">
            <Label>Ngân sách ngày</Label>
            <Input type="number" value={dailyBudget} onChange={(e) => setDailyBudget(e.target.value)} />
          </div>
        </div>
        <Button
          disabled={!picked || m.create.isPending}
          onClick={() =>
            m.create.mutate(
              {
                customerId: picked!.customerId,
                loginCustomerId: picked!.loginCustomerId ?? undefined,
                brief: {
                  product,
                  landingPage,
                  objective,
                  location,
                  audience,
                  dailyBudget: Number(dailyBudget),
                },
              },
              { onSuccess: (d) => setActiveId(d.id) },
            )
          }
        >
          AI tạo bản nháp chiến dịch
        </Button>

        {active ? (
          <div className="space-y-3 rounded-md border p-3 text-sm">
            <p className="font-medium">
              {(active.structuredDraft as { campaignName?: string })?.campaignName} · {active.status}
            </p>
            <p>
              Ngân sách ngày: <strong>{money(active.dailyBudget, active.currency)}</strong>
              {' · '}
              Ước tính tháng: <strong>{money(active.monthlyEstimate, active.currency)}</strong>
            </p>
            {active.previewedAt ? (
              <div className="space-y-1 text-muted-foreground">
                <p>Loại: {(active.structuredDraft as { campaignType?: string }).campaignType}</p>
                <p>
                  Headlines:{' '}
                  {((active.structuredDraft as { headlines?: string[] }).headlines ?? []).join(' · ')}
                </p>
                <p>
                  Mô tả:{' '}
                  {((active.structuredDraft as { descriptions?: string[] }).descriptions ?? []).join(
                    ' | ',
                  )}
                </p>
                <p>URL: {(active.structuredDraft as { finalUrl?: string }).finalUrl}</p>
              </div>
            ) : (
              <p className="text-muted-foreground">Chưa xem preview — bấm xem trước toàn bộ chiến dịch.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => m.preview.mutate(active.id)}>
                Xem trước
              </Button>
              <Button size="sm" variant="outline" onClick={() => m.preflight.mutate(active.id)}>
                Kiểm tra trước khi chạy
              </Button>
              <Button
                size="sm"
                onClick={() => m.approve.mutate({ id: active.id, confirm: true })}
                disabled={active.status === 'APPROVED' || active.status === 'DEPLOYED'}
              >
                Xác nhận chạy quảng cáo
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => m.deploy.mutate(active.id)}
                disabled={active.status !== 'APPROVED' && active.status !== 'PARTIAL'}
              >
                Triển khai
              </Button>
            </div>
            {active.latestDeployment ? (
              <p className="text-xs text-muted-foreground">
                Deployment {active.latestDeployment.status}
                {active.latestDeployment.lastError ? ` — ${active.latestDeployment.lastError}` : ''}
              </p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
