'use client';

import { useEffect, useState } from 'react';
import { Bot, Check, Play, Shield, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  useGoogleAdsAutopilot,
  useGoogleAdsAutopilotMutations,
  useGoogleAdsLinkedAccounts,
} from '@/hooks/use-ai-ads-manager';

export function GoogleAdsAutopilotPanel() {
  const accounts = useGoogleAdsLinkedAccounts();
  const selected = (accounts.data?.items ?? []).filter((a) => a.isSelected);
  const [customerId, setCustomerId] = useState('');
  const picked = selected.find((a) => a.customerId === customerId) ?? selected[0] ?? null;

  useEffect(() => {
    if (picked && !customerId) setCustomerId(picked.customerId);
  }, [picked, customerId]);

  const autopilot = useGoogleAdsAutopilot(picked?.customerId);
  const m = useGoogleAdsAutopilotMutations(picked?.customerId);
  const cfg = autopilot.config.data?.config;

  const [maxDaily, setMaxDaily] = useState('');
  const [targetCpa, setTargetCpa] = useState('');
  const [targetRoas, setTargetRoas] = useState('');
  const [stopLoss, setStopLoss] = useState('');

  useEffect(() => {
    if (!cfg) return;
    setMaxDaily(cfg.maxDailyBudget != null ? String(cfg.maxDailyBudget) : '');
    setTargetCpa(cfg.targetCpa != null ? String(cfg.targetCpa) : '');
    setTargetRoas(cfg.targetRoas != null ? String(cfg.targetRoas) : '');
    setStopLoss(cfg.stopLossDailySpend != null ? String(cfg.stopLossDailySpend) : '');
  }, [cfg?.id]);

  if (!picked) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Google Ads Autopilot</CardTitle>
          <CardDescription>Chọn tài khoản Google Ads ở tab Kết nối trước.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" /> Google Ads Autopilot
          </CardTitle>
          <CardDescription>
            RECOMMEND_ONLY: AI đề xuất, bạn duyệt mới mutate. AUTO_APPLY: action nhỏ tự chạy khi vượt
            guardrail; action rủi ro chờ duyệt. Tắt Auto-Apply có hiệu lực ngay trước mọi write.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Tài khoản</Label>
              <Select value={picked.customerId} onValueChange={setCustomerId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {selected.map((a) => (
                    <SelectItem key={a.customerId} value={a.customerId}>
                      {a.name || a.customerId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Chế độ</Label>
              <Select
                value={
                  cfg?.mode === 'MANUAL'
                    ? 'RECOMMEND_ONLY'
                    : cfg?.mode === 'GUARDED_AUTO'
                      ? 'AUTO_APPLY'
                      : (cfg?.mode ?? 'RECOMMEND_ONLY')
                }
                onValueChange={(mode) =>
                  m.upsertConfig.mutate({
                    customerId: picked.customerId,
                    mode: mode as 'RECOMMEND_ONLY' | 'AUTO_APPLY',
                    enabled: cfg?.enabled ?? false,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RECOMMEND_ONLY">RECOMMEND_ONLY — chờ duyệt</SelectItem>
                  <SelectItem value="AUTO_APPLY">AUTO_APPLY — tự động có guardrail</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="autopilot-on">Autopilot</Label>
              <input
                id="autopilot-on"
                type="checkbox"
                className="h-4 w-4"
                checked={cfg?.enabled ?? false}
                onChange={(e) =>
                  m.upsertConfig.mutate({
                    customerId: picked.customerId,
                    enabled: e.target.checked,
                    mode: (cfg?.mode === 'MANUAL'
                      ? 'RECOMMEND_ONLY'
                      : cfg?.mode === 'GUARDED_AUTO'
                        ? 'AUTO_APPLY'
                        : (cfg?.mode ?? 'RECOMMEND_ONLY')) as 'RECOMMEND_ONLY' | 'AUTO_APPLY',
                  })
                }
              />
              <Badge variant={cfg?.enabled ? 'default' : 'secondary'}>
                {cfg?.enabled ? 'ON' : 'OFF'}
              </Badge>
            </div>
            <Button size="sm" variant="outline" onClick={() => m.triggerScan.mutate()}>
              <Play className="mr-1 h-3 w-3" /> Quét ngay
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label>Max ngân sách/ngày (đ)</Label>
              <Input value={maxDaily} onChange={(e) => setMaxDaily(e.target.value)} />
            </div>
            <div>
              <Label>Target CPA</Label>
              <Input value={targetCpa} onChange={(e) => setTargetCpa(e.target.value)} />
            </div>
            <div>
              <Label>Target ROAS</Label>
              <Input value={targetRoas} onChange={(e) => setTargetRoas(e.target.value)} />
            </div>
            <div>
              <Label>Stop-loss chi tiêu/ngày</Label>
              <Input value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} />
            </div>
          </div>

          <Button
            onClick={() =>
              m.upsertConfig.mutate({
                customerId: picked.customerId,
                enabled: cfg?.enabled ?? false,
                mode: (cfg?.mode === 'MANUAL'
                  ? 'RECOMMEND_ONLY'
                  : cfg?.mode === 'GUARDED_AUTO'
                    ? 'AUTO_APPLY'
                    : (cfg?.mode ?? 'RECOMMEND_ONLY')) as 'RECOMMEND_ONLY' | 'AUTO_APPLY',
                maxDailyBudget: maxDaily ? Number(maxDaily) : undefined,
                targetCpa: targetCpa ? Number(targetCpa) : undefined,
                targetRoas: targetRoas ? Number(targetRoas) : undefined,
                stopLossDailySpend: stopLoss ? Number(stopLoss) : undefined,
                maxActionsPerDay: cfg?.maxActionsPerDay ?? 10,
                gracePeriodHours: 0,
              })
            }
          >
            <Shield className="mr-2 h-4 w-4" /> Lưu guardrail
          </Button>

          {cfg && (
            <p className="text-xs text-muted-foreground">
              Hành động hôm nay: {cfg.actionsToday}/{cfg.maxActionsPerDay}
              {cfg.lastScanAt ? ` · Quét lần cuối: ${new Date(cfg.lastScanAt).toLocaleString('vi-VN')}` : ''}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Đề xuất chờ duyệt</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(autopilot.proposals.data?.items ?? [])
            .filter((p) => p.status === 'PENDING')
            .map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2 text-sm"
              >
                <div>
                  <Badge variant={p.riskLevel === 'HIGH' ? 'destructive' : 'secondary'}>
                    {p.riskLevel}
                  </Badge>{' '}
                  {p.actionType} — {p.reason}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => m.approveProposal.mutate(p.id)}>
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => m.rejectProposal.mutate({ id: p.id, reason: 'User rejected' })}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          {(autopilot.proposals.data?.items ?? []).filter((p) => p.status === 'PENDING').length ===
            0 && <p className="text-sm text-muted-foreground">Không có đề xuất chờ duyệt.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lịch sử hành động</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(autopilot.actions.data?.items ?? []).slice(0, 15).map((a) => (
            <div key={a.id} className="rounded border px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{a.status}</Badge>
                {a.actionType}
                {a.providerWriteEnabled ? (
                  <Badge variant="outline">live write</Badge>
                ) : (
                  <Badge variant="secondary">dry-run</Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {a.createdAt}
                {a.outcomes?.length
                  ? ` · Outcome: ${a.outcomes.map((o) => `${o.horizon}:${o.verdict}`).join(', ')}`
                  : ''}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
