'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Facebook,
  Mail,
  Pause,
  Play,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  StopCircle,
  Unplug,
  Wand2,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { LoadingState, ErrorState } from '@/components/shared/page-state';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  useAiAdsCampaigns,
  useAiAdsConnections,
  useAiAdsDashboard,
  useAiAdsDrafts,
  useAiAdsEmailReports,
  useAiAdsLogs,
  useAiAdsMutations,
  useAiAdsRules,
  useAiAdsSettings,
  useAdsDateRange,
} from '@/hooks/use-ai-ads-manager';
import {
  CONNECTION_STATUS_LABEL,
  RULE_TYPE_OPTIONS,
  type AdManagerCampaignRow,
} from '@/types/ai-ads-manager';
import { cn } from '@/lib/utils';

function formatMoney(n: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(Math.round(n))}đ`;
}

function formatNum(n: number, digits = 2): string {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: digits }).format(n);
}

function platformLabel(p: string) {
  if (p === 'META') return 'Facebook';
  if (p === 'GOOGLE') return 'Google';
  return p;
}

function KpiCard({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-xl">{value}</CardTitle>
      </CardHeader>
      {sub && <CardContent className="pt-0 text-xs text-muted-foreground">{sub}</CardContent>}
    </Card>
  );
}

export function AiAdsManagerPage() {
  const { dateFrom, dateTo } = useAdsDateRange();
  const [range, setRange] = useState({ dateFrom, dateTo });
  const [detailCampaign, setDetailCampaign] = useState<AdManagerCampaignRow | null>(null);
  const [ruleName, setRuleName] = useState('Rule mới');
  const [ruleType, setRuleType] = useState<string>(RULE_TYPE_OPTIONS[0].value);
  const [ruleThreshold, setRuleThreshold] = useState('500000');
  const [googleCustomerId, setGoogleCustomerId] = useState('');
  const [googleToken, setGoogleToken] = useState('');
  const [gmailEmail, setGmailEmail] = useState('');
  const [gmailToken, setGmailToken] = useState('');
  const [draftObjective, setDraftObjective] = useState('lead_form');
  const [draftBudget, setDraftBudget] = useState('500000');
  const [reportEmail, setReportEmail] = useState('');

  const dashboard = useAiAdsDashboard(range.dateFrom, range.dateTo);
  const connections = useAiAdsConnections();
  const campaigns = useAiAdsCampaigns(range.dateFrom, range.dateTo);
  const settings = useAiAdsSettings();
  const rules = useAiAdsRules();
  const logs = useAiAdsLogs();
  const drafts = useAiAdsDrafts();
  const emailReports = useAiAdsEmailReports();

  const m = useAiAdsMutations();

  const connMap = useMemo(() => {
    const items = connections.data?.items ?? [];
    return Object.fromEntries(items.map((c) => [c.provider, c]));
  }, [connections.data]);

  const isLoading =
    dashboard.isLoading || connections.isLoading || campaigns.isLoading || settings.isLoading;

  if (isLoading) return <LoadingState />;
  if (dashboard.isError || campaigns.isError)
    return <ErrorState onRetry={() => void dashboard.refetch()} />;

  const d = dashboard.data!;
  const s = settings.data!;

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Ads Manager"
        description="Quản lý và tối ưu quảng cáo Facebook Ads + Google Ads với AI"
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => m.sync.mutate(range)}
          disabled={m.sync.isPending}
        >
          <RefreshCw className={cn('mr-2 h-4 w-4', m.sync.isPending && 'animate-spin')} />
          Đồng bộ dữ liệu
        </Button>
      </PageHeader>

      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <Label htmlFor="dateFrom">Từ ngày</Label>
          <Input
            id="dateFrom"
            type="date"
            value={range.dateFrom}
            onChange={(e) => setRange((r) => ({ ...r, dateFrom: e.target.value }))}
            className="w-40"
          />
        </div>
        <div>
          <Label htmlFor="dateTo">Đến ngày</Label>
          <Input
            id="dateTo"
            type="date"
            value={range.dateTo}
            onChange={(e) => setRange((r) => ({ ...r, dateTo: e.target.value }))}
            className="w-40"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <KpiCard title="Tổng chi tiêu" value={formatMoney(d.totalSpend)} />
        <KpiCard title="Doanh thu" value={formatMoney(d.totalRevenue)} />
        <KpiCard title="ROAS" value={d.roas != null ? formatNum(d.roas) : '—'} />
        <KpiCard title="CPA/CPL" value={d.cpa > 0 ? formatMoney(d.cpa) : '—'} />
        <KpiCard title="Chuyển đổi" value={String(d.totalConversions)} />
        <KpiCard title="Đang chạy" value={String(d.activeCampaigns)} />
        <KpiCard title="Kém hiệu quả" value={String(d.poorCampaigns)} />
        <KpiCard
          title="Lãi/lỗ"
          value={formatMoney(d.profit)}
          sub={d.profit >= 0 ? 'Có lãi' : 'Đang lỗ'}
        />
      </div>

      <Tabs defaultValue="campaigns">
        <TabsList>
          <TabsTrigger value="campaigns">Chiến dịch</TabsTrigger>
          <TabsTrigger value="connections">Kết nối</TabsTrigger>
          <TabsTrigger value="automation">Auto Mode & Rule</TabsTrigger>
          <TabsTrigger value="drafts">Bản nháp AI</TabsTrigger>
          <TabsTrigger value="reports">Gmail báo cáo</TabsTrigger>
          <TabsTrigger value="logs">Audit log</TabsTrigger>
        </TabsList>

        <TabsContent value="connections" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <ConnectionCard
              title="Facebook Ads"
              icon={<Facebook className="h-5 w-5 text-blue-600" />}
              conn={connMap.META}
              onConnect={() => void m.startMetaOAuth()}
              onDisconnect={() => m.disconnect.mutate('META')}
            />
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <span className="text-emerald-600 font-bold">G</span> Google Ads
                </CardTitle>
                <CardDescription>
                  {connMap.GOOGLE
                    ? CONNECTION_STATUS_LABEL[connMap.GOOGLE.status]
                    : 'Chưa kết nối'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Input
                  placeholder="Customer ID"
                  value={googleCustomerId}
                  onChange={(e) => setGoogleCustomerId(e.target.value)}
                />
                <Input
                  placeholder="Refresh token (không lưu plain log)"
                  type="password"
                  value={googleToken}
                  onChange={(e) => setGoogleToken(e.target.value)}
                />
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() =>
                    m.connectGoogle.mutate({
                      customerId: googleCustomerId,
                      refreshToken: googleToken,
                    })
                  }
                  disabled={!googleCustomerId || !googleToken}
                >
                  Kết nối Google Ads
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Mail className="h-5 w-5" /> Gmail báo cáo
                </CardTitle>
                <CardDescription>
                  {connMap.GMAIL
                    ? CONNECTION_STATUS_LABEL[connMap.GMAIL.status]
                    : 'Chưa kết nối'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Input
                  placeholder="Email nhận báo cáo"
                  value={gmailEmail}
                  onChange={(e) => setGmailEmail(e.target.value)}
                />
                <Input
                  placeholder="Gmail refresh token"
                  type="password"
                  value={gmailToken}
                  onChange={(e) => setGmailToken(e.target.value)}
                />
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() =>
                    m.connectGmail.mutate({ email: gmailEmail, refreshToken: gmailToken })
                  }
                  disabled={!gmailEmail || !gmailToken}
                >
                  Kết nối Gmail
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="campaigns">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nền tảng</TableHead>
                    <TableHead>Tên</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead className="text-right">Chi tiêu</TableHead>
                    <TableHead className="text-right">CTR</TableHead>
                    <TableHead className="text-right">CPA</TableHead>
                    <TableHead className="text-right">ROAS</TableHead>
                    <TableHead className="text-right">Điểm</TableHead>
                    <TableHead>Gợi ý AI</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(campaigns.data?.items ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                        Chưa có dữ liệu — kết nối tài khoản và bấm Đồng bộ
                      </TableCell>
                    </TableRow>
                  ) : (
                    campaigns.data!.items.map((c) => (
                      <TableRow key={c.insightId}>
                        <TableCell>
                          <Badge variant="secondary">{platformLabel(c.platform)}</Badge>
                        </TableCell>
                        <TableCell className="font-medium max-w-[180px] truncate">{c.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{c.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right">{formatMoney(c.spend)}</TableCell>
                        <TableCell className="text-right">{formatNum(c.ctr)}%</TableCell>
                        <TableCell className="text-right">
                          {c.cpa > 0 ? formatMoney(c.cpa) : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          {c.roas != null ? formatNum(c.roas) : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant={(c.efficiencyScore ?? 0) >= 60 ? 'default' : 'secondary'}
                            className={
                              (c.efficiencyScore ?? 0) < 60 ? 'bg-red-100 text-red-800' : undefined
                            }
                          >
                            {c.efficiencyScore ?? '—'}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                          {c.aiSuggestion ?? '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <Button size="sm" variant="ghost" onClick={() => setDetailCampaign(c)}>
                              Chi tiết
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => m.pauseCampaign.mutate(c.id)}
                            >
                              <Pause className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => m.enableCampaign.mutate(c.id)}
                            >
                              <Play className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => m.optimizeCampaign.mutate(c.id)}
                            >
                              <Wand2 className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => m.sendReport.mutate(range)}
                            >
                              <Send className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="automation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" /> Auto Mode
              </CardTitle>
              <CardDescription>
                Mặc định tắt. Khi bật, AI có thể pause/enable theo rule (có giới hạn/ngày).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="auto-mode">Bật Auto Mode</Label>
                <input
                  id="auto-mode"
                  type="checkbox"
                  className="h-4 w-4"
                  checked={s.autoModeEnabled}
                  onChange={(e) =>
                    m.updateAutoMode.mutate({
                      autoModeEnabled: e.target.checked,
                      dailyBudgetLimit: s.dailyBudgetLimit ?? undefined,
                      maxTogglesPerDay: s.maxTogglesPerDay,
                    })
                  }
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Giới hạn ngân sách/ngày (đ)</Label>
                  <Input
                    type="number"
                    defaultValue={s.dailyBudgetLimit ?? ''}
                    onBlur={(e) =>
                      m.updateAutoMode.mutate({
                        autoModeEnabled: s.autoModeEnabled,
                        dailyBudgetLimit: Number(e.target.value) || undefined,
                        maxTogglesPerDay: s.maxTogglesPerDay,
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Max bật/tắt/ngày: {s.togglesToday}/{s.maxTogglesPerDay}</Label>
                </div>
              </div>
              <Button
                variant="destructive"
                onClick={() => m.emergencyStop.mutate(true)}
                disabled={s.emergencyStop}
              >
                <StopCircle className="mr-2 h-4 w-4" />
                Dừng toàn bộ tự động
              </Button>
              {s.emergencyStop && (
                <p className="text-sm text-amber-700 flex items-center gap-1">
                  <ShieldAlert className="h-4 w-4" /> Emergency stop đang bật — Auto Mode đã tắt
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rule tự động</CardTitle>
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
                  m.createRule.mutate({
                    name: ruleName,
                    ruleType,
                    threshold: Number(ruleThreshold),
                    spendThreshold: ruleType === 'PAUSE_SPEND_NO_CONVERSION' ? Number(ruleThreshold) : undefined,
                  })
                }
              >
                Thêm rule
              </Button>
              <ul className="space-y-2">
                {(rules.data?.items ?? []).map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between rounded border px-3 py-2 text-sm"
                  >
                    <span>
                      {r.name} — {r.ruleType}{' '}
                      {r.threshold != null && `(ngưỡng ${r.threshold})`}
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => m.deleteRule.mutate(r.id)}>
                      Xóa
                    </Button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="drafts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" /> Tạo bản nháp bằng AI
              </CardTitle>
              <CardDescription>Chỉ đăng khi bạn bấm Duyệt & Đăng quảng cáo</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <Select value="META" onValueChange={() => {}}>
                  <SelectTrigger>
                    <SelectValue placeholder="Nền tảng" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="META">Facebook</SelectItem>
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
                onClick={() =>
                  m.generateDraft.mutate({
                    platform: 'META',
                    objective: draftObjective,
                    budget: Number(draftBudget),
                  })
                }
              >
                Tạo bản nháp AI
              </Button>
            </CardContent>
          </Card>
          <div className="grid gap-3 md:grid-cols-2">
            {(drafts.data?.items ?? []).map((draft) => (
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
                  {draft.status === 'DRAFT' && (
                    <Button size="sm" onClick={() => m.publishDraft.mutate(draft.id)}>
                      Duyệt & Đăng quảng cáo
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="reports">
          <Card>
            <CardHeader>
              <CardTitle>Gmail báo cáo</CardTitle>
              <CardDescription>Hằng ngày, hằng tuần hoặc khi cảnh báo</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="Email nhận báo cáo"
                value={reportEmail}
                onChange={(e) => setReportEmail(e.target.value)}
              />
              <Button
                onClick={() =>
                  m.upsertEmailReport.mutate({
                    enabled: true,
                    schedule: 'DAILY',
                    recipientEmail: reportEmail,
                  })
                }
              >
                Lưu cấu hình
              </Button>
              <Button variant="outline" onClick={() => m.sendReport.mutate(range)}>
                Gửi báo cáo ngay
              </Button>
              {(emailReports.data?.items ?? []).map((r) => (
                <p key={r.id} className="text-sm text-muted-foreground">
                  {r.recipientEmail} · {r.schedule}
                  {r.lastSentAt && ` · Gửi lần cuối: ${new Date(r.lastSentAt).toLocaleString('vi-VN')}`}
                </p>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Thời gian</TableHead>
                    <TableHead>Hành động</TableHead>
                    <TableHead>Chiến dịch</TableHead>
                    <TableHead>Auto</TableHead>
                    <TableHead>Lý do</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(logs.data?.items ?? []).map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs">
                        {new Date(log.createdAt).toLocaleString('vi-VN')}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{log.action}</Badge>
                      </TableCell>
                      <TableCell>{log.campaignName ?? '—'}</TableCell>
                      <TableCell>{log.autoMode ? 'Có' : 'Không'}</TableCell>
                      <TableCell className="max-w-[300px] truncate text-xs">{log.reason}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!detailCampaign} onOpenChange={() => setDetailCampaign(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{detailCampaign?.name}</DialogTitle>
            <DialogDescription>{platformLabel(detailCampaign?.platform ?? '')}</DialogDescription>
          </DialogHeader>
          {detailCampaign && (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>Impression: {formatNum(detailCampaign.impressions, 0)}</div>
              <div>Click: {formatNum(detailCampaign.clicks, 0)}</div>
              <div>CPC: {formatMoney(detailCampaign.cpc)}</div>
              <div>CPM: {formatMoney(detailCampaign.cpm)}</div>
              <div>Lead/Conv: {formatNum(detailCampaign.leads + detailCampaign.conversions, 0)}</div>
              <div className="col-span-2">
                <Label>Gợi ý AI</Label>
                <Textarea readOnly value={detailCampaign.aiSuggestion ?? ''} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ConnectionCard({
  title,
  icon,
  conn,
  onConnect,
  onDisconnect,
}: {
  title: string;
  icon: React.ReactNode;
  conn?: { status: keyof typeof CONNECTION_STATUS_LABEL; accountName: string | null; connected: boolean };
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const status = conn?.status ?? 'DISCONNECTED';
  const tone =
    status === 'CONNECTED'
      ? 'bg-emerald-100 text-emerald-800'
      : status === 'TOKEN_EXPIRED' || status === 'ERROR'
        ? 'bg-red-100 text-red-800'
        : status === 'INSUFFICIENT_PERMISSIONS'
          ? 'bg-amber-100 text-amber-900'
          : 'bg-slate-100 text-slate-700';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {icon} {title}
        </CardTitle>
        <span className={cn('inline-flex w-fit rounded px-2 py-0.5 text-xs', tone)}>
          {CONNECTION_STATUS_LABEL[status]}
        </span>
      </CardHeader>
      <CardContent className="space-y-2">
        {conn?.accountName && (
          <p className="text-sm text-muted-foreground">{conn.accountName}</p>
        )}
        {!conn?.connected ? (
          <Button size="sm" className="w-full" onClick={onConnect}>
            Kết nối
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="w-full" onClick={onDisconnect}>
            <Unplug className="mr-2 h-4 w-4" /> Ngắt kết nối
          </Button>
        )}
        {(status === 'TOKEN_EXPIRED' || status === 'INSUFFICIENT_PERMISSIONS') && (
          <p className="text-xs text-amber-700 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Vui lòng kết nối lại
          </p>
        )}
      </CardContent>
    </Card>
  );
}
