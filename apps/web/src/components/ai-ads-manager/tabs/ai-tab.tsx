'use client';

import { useState } from 'react';
import { Bot, Sparkles, StopCircle, ShieldAlert } from 'lucide-react';
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
import { LoadingState, EmptyState, ErrorState } from '@/components/shared/page-state';
import {
  RULE_TYPE_OPTIONS,
  type AdDraft,
  type AdManagerCampaignRow,
  type AdManagerSettings,
  type AutomationRule,
} from '@/types/ai-ads-manager';
import { platformLabel } from '../ads-format';

export function AdsAiTab({
  settings,
  rules,
  drafts,
  poorCampaigns,
  isLoading,
  isError,
  onRetry,
  canAnalyze,
  canManage,
  onGenerateDraft,
  onPublishDraft,
  onCreateRule,
  onDeleteRule,
  onOptimize,
  generatePending,
}: {
  settings?: AdManagerSettings;
  rules: AutomationRule[];
  drafts: AdDraft[];
  poorCampaigns: AdManagerCampaignRow[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  canAnalyze: boolean;
  canManage: boolean;
  onGenerateDraft: (body: Record<string, unknown>) => void;
  onPublishDraft: (id: string) => void;
  onCreateRule: (body: Record<string, unknown>) => void;
  onDeleteRule: (id: string) => void;
  onOptimize: (id: string) => void;
  generatePending: boolean;
}) {
  const [draftObjective, setDraftObjective] = useState('lead_form');
  const [draftBudget, setDraftBudget] = useState('500000');
  const [draftPlatform, setDraftPlatform] = useState('META');
  const [ruleName, setRuleName] = useState('Rule mới');
  const [ruleType, setRuleType] = useState<string>(RULE_TYPE_OPTIONS[0].value);
  const [ruleThreshold, setRuleThreshold] = useState('500000');

  if (isLoading) return <LoadingState message="Đang tải AI phân tích..." />;
  if (isError) return <ErrorState onRetry={onRetry} />;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-5 w-5" /> Chiến dịch cần chú ý
          </CardTitle>
          <CardDescription>Dựa trên efficiencyScore đã lưu trong DB</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {poorCampaigns.length === 0 ? (
            <EmptyState title="Không có chiến dịch kém" className="py-8" />
          ) : (
            poorCampaigns.slice(0, 8).map((c) => (
              <div
                key={c.insightId}
                className="flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">
                    {platformLabel(c.platform)} · {c.name}
                  </p>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    Điểm {c.efficiencyScore ?? '—'} — {c.aiSuggestion ?? 'Chưa có gợi ý'}
                  </p>
                </div>
                {canAnalyze && (
                  <Button size="sm" variant="outline" onClick={() => onOptimize(c.id)}>
                    Phân tích lại
                  </Button>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-5 w-5" /> Bản nháp AI
          </CardTitle>
          <CardDescription>Chỉ đăng khi bạn duyệt — cần ads.analyze / ads.manage</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!canAnalyze ? (
            <p className="text-sm text-muted-foreground">Bạn không có quyền ads.analyze</p>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-3">
                <Select value={draftPlatform} onValueChange={setDraftPlatform}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="META">Meta</SelectItem>
                    <SelectItem value="GOOGLE">Google</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={draftObjective}
                  onChange={(e) => setDraftObjective(e.target.value)}
                  placeholder="Mục tiêu"
                />
                <Input
                  type="number"
                  value={draftBudget}
                  onChange={(e) => setDraftBudget(e.target.value)}
                  placeholder="Ngân sách"
                />
              </div>
              <Button
                disabled={generatePending}
                onClick={() =>
                  onGenerateDraft({
                    platform: draftPlatform,
                    objective: draftObjective,
                    budget: Number(draftBudget),
                  })
                }
              >
                Tạo bản nháp AI
              </Button>
            </>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {drafts.length === 0 ? (
              <p className="text-sm text-muted-foreground col-span-2">Chưa có bản nháp</p>
            ) : (
              drafts.map((draft) => (
                <Card key={draft.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{draft.headline ?? 'Bản nháp'}</CardTitle>
                    <CardDescription>
                      {platformLabel(draft.platform)} · {draft.status}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p>{draft.content}</p>
                    <p className="text-muted-foreground">CTA: {draft.cta}</p>
                    {draft.status === 'DRAFT' && canManage && (
                      <Button size="sm" onClick={() => onPublishDraft(draft.id)}>
                        Duyệt & Đăng
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {canManage && settings && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rule tự động (AI)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <Input value={ruleName} onChange={(e) => setRuleName(e.target.value)} />
              <Select value={ruleType} onValueChange={setRuleType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RULE_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                value={ruleThreshold}
                onChange={(e) => setRuleThreshold(e.target.value)}
                placeholder="Ngưỡng"
              />
            </div>
            <Button
              size="sm"
              onClick={() =>
                onCreateRule({
                  name: ruleName,
                  ruleType,
                  threshold: Number(ruleThreshold),
                  spendThreshold:
                    ruleType === 'PAUSE_SPEND_NO_CONVERSION'
                      ? Number(ruleThreshold)
                      : undefined,
                })
              }
            >
              Thêm rule
            </Button>
            <ul className="space-y-2">
              {rules.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between rounded border px-3 py-2 text-sm"
                >
                  <span>
                    {r.name} — {r.ruleType}{' '}
                    {r.threshold != null && `(ngưỡng ${r.threshold})`}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => onDeleteRule(r.id)}>
                    Xóa
                  </Button>
                </li>
              ))}
            </ul>
            {settings.emergencyStop && (
              <p className="text-sm text-amber-700 flex items-center gap-1">
                <ShieldAlert className="h-4 w-4" /> Emergency stop đang bật
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function AdsSettingsEmergencyHint({
  emergencyStop,
}: {
  emergencyStop?: boolean;
}) {
  if (!emergencyStop) return null;
  return (
    <p className="text-sm text-amber-700 flex items-center gap-1">
      <StopCircle className="h-4 w-4" /> Auto Mode đã dừng khẩn cấp
    </p>
  );
}
