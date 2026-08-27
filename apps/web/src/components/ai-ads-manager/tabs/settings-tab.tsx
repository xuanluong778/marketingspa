'use client';

import { useState } from 'react';
import { Bot, Mail, ShieldAlert, StopCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { LoadingState, EmptyState, ErrorState } from '@/components/shared/page-state';
import type {
  AdManagerSettings,
  AutomationLog,
  EmailReportConfig,
} from '@/types/ai-ads-manager';
import { useT } from '@/i18n/i18n-provider';

export function AdsSettingsTab({
  settings,
  emailReports,
  logs,
  isLoading,
  isError,
  onRetry,
  canManage,
  canAnalyze,
  dateFrom,
  dateTo,
  onUpdateAutoMode,
  onEmergencyStop,
  onUpsertEmailReport,
  onSendReport,
}: {
  settings?: AdManagerSettings;
  emailReports: EmailReportConfig[];
  logs: AutomationLog[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  canManage: boolean;
  canAnalyze: boolean;
  dateFrom: string;
  dateTo: string;
  onUpdateAutoMode: (body: {
    autoModeEnabled: boolean;
    mcpMode?: 'OBSERVE' | 'SUGGEST' | 'AUTO';
    dailyBudgetLimit?: number;
    maxTogglesPerDay?: number;
  }) => void;
  onEmergencyStop: (v: boolean) => void;
  onUpsertEmailReport: (body: Record<string, unknown>) => void;
  onSendReport: () => void;
}) {
  const t = useT();
  const [reportEmail, setReportEmail] = useState('');

  if (isLoading) return <LoadingState message={t('aiAds.loadingSettings')} />;
  if (isError) return <ErrorState onRetry={onRetry} />;
  if (!settings) {
    return <EmptyState title={t('aiAds.emptySettings')} />;
  }

  const s = settings;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-5 w-5" /> Auto Mode
          </CardTitle>
          <CardDescription>
            OBSERVE = chỉ đề xuất · SUGGEST = chờ duyệt · AUTO = tự động trong giới hạn.
            Emergency Stop tắt mọi ghi. Cần ads.manage + ads_management.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!canManage ? (
            <p className="text-sm text-muted-foreground">Bạn không có quyền ads.manage</p>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="mcp-mode">Chế độ MCP</Label>
                <select
                  id="mcp-mode"
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={s.mcpMode ?? (s.autoModeEnabled ? 'AUTO' : 'SUGGEST')}
                  onChange={(e) =>
                    onUpdateAutoMode({
                      autoModeEnabled: e.target.value === 'AUTO',
                      mcpMode: e.target.value as 'OBSERVE' | 'SUGGEST' | 'AUTO',
                      dailyBudgetLimit: s.dailyBudgetLimit ?? undefined,
                      maxTogglesPerDay: s.maxTogglesPerDay,
                    })
                  }
                >
                  <option value="OBSERVE">OBSERVE — chỉ đề xuất</option>
                  <option value="SUGGEST">SUGGEST — chờ duyệt</option>
                  <option value="AUTO">AUTO — tự động trong giới hạn</option>
                </select>
              </div>
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="auto-mode">Bật Auto Mode (tương đương AUTO)</Label>
                <input
                  id="auto-mode"
                  type="checkbox"
                  className="h-4 w-4"
                  checked={s.autoModeEnabled}
                  onChange={(e) =>
                    onUpdateAutoMode({
                      autoModeEnabled: e.target.checked,
                      mcpMode: e.target.checked ? 'AUTO' : 'SUGGEST',
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
                      onUpdateAutoMode({
                        autoModeEnabled: s.autoModeEnabled,
                        dailyBudgetLimit: Number(e.target.value) || undefined,
                        maxTogglesPerDay: s.maxTogglesPerDay,
                      })
                    }
                  />
                </div>
                <div>
                  <Label>
                    Max bật/tắt/ngày: {s.togglesToday}/{s.maxTogglesPerDay}
                  </Label>
                </div>
              </div>
              <Button
                variant="destructive"
                onClick={() => onEmergencyStop(true)}
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
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-5 w-5" /> Báo cáo email
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Email nhận báo cáo"
            value={reportEmail}
            onChange={(e) => setReportEmail(e.target.value)}
            disabled={!canManage}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!canManage || !reportEmail}
              onClick={() =>
                onUpsertEmailReport({
                  enabled: true,
                  schedule: 'DAILY',
                  recipientEmail: reportEmail,
                })
              }
            >
              Lưu cấu hình
            </Button>
            <Button
              variant="outline"
              disabled={!canAnalyze}
              onClick={onSendReport}
            >
              Gửi báo cáo ({dateFrom} → {dateTo})
            </Button>
          </div>
          {emailReports.map((r) => (
            <p key={r.id} className="text-sm text-muted-foreground">
              {r.recipientEmail} · {r.schedule}
              {r.lastSentAt &&
                ` · Gửi lần cuối: ${new Date(r.lastSentAt).toLocaleString('vi-VN')}`}
            </p>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit log gần đây</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {logs.length === 0 ? (
            <EmptyState title={t('aiAds.emptyAuditLog')} className="py-8" />
          ) : (
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
                {logs.slice(0, 30).map((log) => (
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
