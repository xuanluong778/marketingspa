'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ErrorState, LoadingState } from '@/components/shared/page-state';
import { formatCurrency, formatDateTime } from '@/lib/format';
import {
  useAdminAffiliateAudit,
  useAdminAffiliateCommissions,
  useAdminAffiliateFraud,
  useAdminAffiliateMut,
  useAdminAffiliateOverview,
  useAdminAffiliatePartners,
  useAdminAffiliatePayouts,
  useAdminAffiliateReferrals,
  useAdminAffiliateSettings,
} from '@/hooks/use-affiliate';

type Tab =
  | 'overview'
  | 'partners'
  | 'referrals'
  | 'commissions'
  | 'payouts'
  | 'fraud'
  | 'settings'
  | 'audit';

export default function AdminAffiliatePage() {
  const [tab, setTab] = useState<Tab>('overview');
  const overview = useAdminAffiliateOverview();
  const mut = useAdminAffiliateMut();

  const tabs: Array<[Tab, string]> = [
    ['overview', 'Tổng quan'],
    ['partners', 'Đối tác'],
    ['referrals', 'Referrals'],
    ['commissions', 'Hoa hồng'],
    ['payouts', 'Yêu cầu rút'],
    ['fraud', 'Gian lận'],
    ['settings', 'Cấu hình'],
    ['audit', 'Audit log'],
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Quản trị Affiliate</h2>
        <p className="text-sm text-muted-foreground">
          SUPER_ADMIN · thao tác tiền bắt buộc lý do · audit before/after
        </p>
      </div>
      <nav className="flex flex-wrap gap-1 rounded-xl border border-white/10 bg-[#0A3D30] p-1.5">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`rounded-lg px-3 py-2 text-xs font-medium sm:text-sm ${
              tab === k ? 'bg-white text-[#0A3D30]' : 'text-white/80 hover:bg-white/10'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'overview' && (
        <>
          {overview.isLoading && <LoadingState />}
          {overview.isError && <ErrorState onRetry={() => void overview.refetch()} />}
          {overview.data && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(overview.data as Record<string, number>).map(([k, v]) => (
                <div key={k} className="rounded-xl border p-4">
                  <div className="text-xs text-muted-foreground">{k}</div>
                  <div className="mt-1 text-lg font-semibold">
                    {typeof v === 'number' && k.toLowerCase().includes('commission')
                      ? formatCurrency(v)
                      : String(v)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {tab === 'partners' && <PartnersTab mut={mut} />}
      {tab === 'referrals' && <ReferralsTab />}
      {tab === 'commissions' && <CommissionsTab mut={mut} />}
      {tab === 'payouts' && <PayoutsTab mut={mut} />}
      {tab === 'fraud' && <FraudTab />}
      {tab === 'settings' && <SettingsTab mut={mut} />}
      {tab === 'audit' && <AuditTab />}
    </div>
  );
}

function PartnersTab({ mut }: { mut: ReturnType<typeof useAdminAffiliateMut> }) {
  const [q, setQ] = useState('');
  const list = useAdminAffiliatePartners({ q, page: 1, pageSize: 30 });
  if (list.isLoading) return <LoadingState />;
  if (list.isError) return <ErrorState onRetry={() => void list.refetch()} />;
  const items = ((list.data as { items?: Array<Record<string, unknown>> })?.items ??
    []) as Array<{
    id: string;
    code: string;
    status: string;
    customRate: number | null;
    user: { email: string; name: string };
    availableAmount: number;
    pendingAmount: number;
  }>;
  return (
    <div className="space-y-3">
      <input
        className="h-9 rounded-md border bg-background px-3 text-sm"
        placeholder="Tìm code/email"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-3 py-2 text-left">Đối tác</th>
              <th className="px-3 py-2 text-left">Rate</th>
              <th className="px-3 py-2 text-right">Pending</th>
              <th className="px-3 py-2 text-right">Available</th>
              <th className="px-3 py-2 text-left">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="px-3 py-2">
                  <div className="font-mono text-xs">{p.code}</div>
                  <div className="text-xs">{p.user.email}</div>
                  <Badge variant="outline">{p.status}</Badge>
                </td>
                <td className="px-3 py-2 text-xs">
                  {p.customRate != null ? `${(p.customRate * 100).toFixed(0)}%` : 'default'}
                </td>
                <td className="px-3 py-2 text-right">{formatCurrency(p.pendingAmount)}</td>
                <td className="px-3 py-2 text-right">{formatCurrency(p.availableAmount)}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-col gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const status = window.prompt('Status: ACTIVE|SUSPENDED|PENDING_REVIEW|REJECTED');
                        const reason = window.prompt('Lý do');
                        if (!status || !reason || reason.length < 3) return;
                        mut.setStatus.mutate(
                          { id: p.id, status, reason },
                          {
                            onSuccess: () => window.alert('OK'),
                            onError: (e) => window.alert(e instanceof Error ? e.message : 'Lỗi'),
                          },
                        );
                      }}
                    >
                      Duyệt/Khóa
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        const rate = Number(window.prompt('Tỷ lệ (0-1, VD 0.3)'));
                        const reason = window.prompt('Lý do');
                        if (!Number.isFinite(rate) || !reason || reason.length < 3) return;
                        mut.setRate.mutate(
                          { id: p.id, customRate: rate, reason },
                          {
                            onSuccess: () => window.alert('OK'),
                            onError: (e) => window.alert(e instanceof Error ? e.message : 'Lỗi'),
                          },
                        );
                      }}
                    >
                      Sửa rate
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReferralsTab() {
  const list = useAdminAffiliateReferrals({ page: 1, pageSize: 30 });
  if (list.isLoading) return <LoadingState />;
  if (list.isError) return <ErrorState onRetry={() => void list.refetch()} />;
  const items = ((list.data as { items?: Array<Record<string, unknown>> })?.items ?? []) as Array<{
    id: string;
    code: string;
    status: string;
    registeredAt: string;
    affiliate: { code: string };
    organization: { name: string; email: string | null };
  }>;
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr>
            <th className="px-3 py-2 text-left">Affiliate</th>
            <th className="px-3 py-2 text-left">Org (masked)</th>
            <th className="px-3 py-2 text-left">Status</th>
            <th className="px-3 py-2 text-left">Đăng ký</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="px-3 py-2 font-mono text-xs">{r.affiliate.code}</td>
              <td className="px-3 py-2 text-xs">
                {r.organization.name}
                <div className="text-muted-foreground">{r.organization.email}</div>
              </td>
              <td className="px-3 py-2">
                <Badge variant="outline">{r.status}</Badge>
              </td>
              <td className="px-3 py-2 text-xs">{formatDateTime(r.registeredAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CommissionsTab({ mut }: { mut: ReturnType<typeof useAdminAffiliateMut> }) {
  const list = useAdminAffiliateCommissions({ page: 1, pageSize: 40 });
  if (list.isLoading) return <LoadingState />;
  if (list.isError) return <ErrorState onRetry={() => void list.refetch()} />;
  const items = ((list.data as { items?: Array<Record<string, unknown>> })?.items ?? []) as Array<{
    id: string;
    orderCode: string;
    commissionVnd: number;
    status: string;
    affiliate: { code: string };
  }>;
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr>
            <th className="px-3 py-2 text-left">Đơn</th>
            <th className="px-3 py-2 text-left">Aff</th>
            <th className="px-3 py-2 text-right">HH</th>
            <th className="px-3 py-2 text-left">TT</th>
            <th className="px-3 py-2 text-left">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {items.map((c) => (
            <tr key={c.id} className="border-t">
              <td className="px-3 py-2 font-mono text-xs">{c.orderCode}</td>
              <td className="px-3 py-2 font-mono text-xs">{c.affiliate.code}</td>
              <td className="px-3 py-2 text-right">{formatCurrency(c.commissionVnd)}</td>
              <td className="px-3 py-2">
                <Badge variant="outline">{c.status}</Badge>
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-col gap-1">
                  {(c.status === 'PENDING' || c.status === 'MANUAL_REVIEW') && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const reason = window.prompt('Lý do duyệt');
                        if (!reason || reason.length < 3) return;
                        mut.approveCommission.mutate(
                          { id: c.id, reason },
                          {
                            onSuccess: () => window.alert('OK'),
                            onError: (e) => window.alert(e instanceof Error ? e.message : 'Lỗi'),
                          },
                        );
                      }}
                    >
                      Duyệt
                    </Button>
                  )}
                  {c.status !== 'REVERSED' && c.status !== 'PAID' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        const reason = window.prompt('Lý do thu hồi');
                        if (!reason || reason.length < 3) return;
                        mut.reverseCommission.mutate(
                          { id: c.id, reason },
                          {
                            onSuccess: () => window.alert('OK'),
                            onError: (e) => window.alert(e instanceof Error ? e.message : 'Lỗi'),
                          },
                        );
                      }}
                    >
                      Thu hồi
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PayoutsTab({ mut }: { mut: ReturnType<typeof useAdminAffiliateMut> }) {
  const list = useAdminAffiliatePayouts({ page: 1, pageSize: 40 });
  if (list.isLoading) return <LoadingState />;
  if (list.isError) return <ErrorState onRetry={() => void list.refetch()} />;
  const items = ((list.data as { items?: Array<Record<string, unknown>> })?.items ?? []) as Array<{
    id: string;
    amountVnd: number;
    status: string;
    accountNumberMasked: string;
    accountName: string;
    affiliate: { code: string };
  }>;
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr>
            <th className="px-3 py-2 text-left">Aff</th>
            <th className="px-3 py-2 text-right">Số tiền</th>
            <th className="px-3 py-2 text-left">STK</th>
            <th className="px-3 py-2 text-left">TT</th>
            <th className="px-3 py-2 text-left">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id} className="border-t">
              <td className="px-3 py-2 font-mono text-xs">{p.affiliate.code}</td>
              <td className="px-3 py-2 text-right">{formatCurrency(p.amountVnd)}</td>
              <td className="px-3 py-2 text-xs">
                {p.accountNumberMasked}
                <div>{p.accountName}</div>
              </td>
              <td className="px-3 py-2">
                <Badge variant="outline">{p.status}</Badge>
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-col gap-1">
                  {p.status === 'PENDING' && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const reason = window.prompt('Lý do duyệt');
                          if (!reason || reason.length < 3) return;
                          mut.approvePayout.mutate({ id: p.id, reason });
                        }}
                      >
                        Duyệt
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          const reason = window.prompt('Lý do từ chối');
                          if (!reason || reason.length < 3) return;
                          mut.rejectPayout.mutate({ id: p.id, reason });
                        }}
                      >
                        Từ chối
                      </Button>
                    </>
                  )}
                  {(p.status === 'PENDING' || p.status === 'APPROVED') && (
                    <Button
                      size="sm"
                      onClick={() => {
                        const reason = window.prompt('Lý do đánh dấu đã chuyển');
                        const paidReference = window.prompt('Mã giao dịch ngân hàng (optional)') || undefined;
                        if (!reason || reason.length < 3) return;
                        mut.markPaid.mutate({ id: p.id, reason, paidReference });
                      }}
                    >
                      Đã chuyển
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FraudTab() {
  const list = useAdminAffiliateFraud();
  if (list.isLoading) return <LoadingState />;
  if (list.isError) return <ErrorState onRetry={() => void list.refetch()} />;
  const items = ((list.data as { items?: Array<Record<string, unknown>> })?.items ?? []) as Array<{
    id: string;
    signalType: string;
    severity: string;
    createdAt: string;
    affiliate: { code: string } | null;
  }>;
  if (!items.length) return <p className="text-sm text-muted-foreground">Không có tín hiệu gian lận mở.</p>;
  return (
    <div className="space-y-2">
      {items.map((f) => (
        <div key={f.id} className="rounded-xl border p-3 text-sm">
          <div className="font-medium">
            {f.signalType} · <Badge variant="outline">{f.severity}</Badge>
          </div>
          <div className="text-xs text-muted-foreground">
            {f.affiliate?.code ?? '—'} · {formatDateTime(f.createdAt)}
          </div>
        </div>
      ))}
    </div>
  );
}

function SettingsTab({ mut }: { mut: ReturnType<typeof useAdminAffiliateMut> }) {
  const s = useAdminAffiliateSettings();
  if (s.isLoading) return <LoadingState />;
  if (s.isError) return <ErrorState onRetry={() => void s.refetch()} />;
  const d = s.data as {
    defaultCommissionRate: string | number;
    holdDays: number;
    minPayoutVnd: string | number;
    allowRenewalCommission: boolean;
  };
  return (
    <div className="space-y-3 rounded-xl border p-4 text-sm">
      <pre className="overflow-x-auto text-xs">{JSON.stringify(d, null, 2)}</pre>
      <Button
        size="sm"
        onClick={() => {
          const rate = Number(window.prompt('defaultCommissionRate (0-1)', String(d.defaultCommissionRate)));
          const reason = window.prompt('Lý do');
          if (!reason || reason.length < 3 || !Number.isFinite(rate)) return;
          mut.updateSettings.mutate(
            { defaultCommissionRate: rate, reason },
            {
              onSuccess: () => window.alert('Đã cập nhật'),
              onError: (e) => window.alert(e instanceof Error ? e.message : 'Lỗi'),
            },
          );
        }}
      >
        Sửa tỷ lệ mặc định
      </Button>
    </div>
  );
}

function AuditTab() {
  const list = useAdminAffiliateAudit({ page: 1, pageSize: 40 });
  if (list.isLoading) return <LoadingState />;
  if (list.isError) return <ErrorState onRetry={() => void list.refetch()} />;
  const items = ((list.data as { items?: Array<Record<string, unknown>> })?.items ?? []) as Array<{
    id: string;
    action: string;
    reason: string | null;
    before: unknown;
    after: unknown;
    ipAddress: string | null;
    createdAt: string;
  }>;
  return (
    <div className="space-y-2">
      {items.map((a) => (
        <details key={a.id} className="rounded-xl border p-3 text-sm">
          <summary className="cursor-pointer font-mono text-xs">
            {a.action} · {formatDateTime(a.createdAt)} · IP {a.ipAddress ?? '—'}
          </summary>
          {a.reason && <div className="mt-1 text-xs text-amber-100">Lý do: {a.reason}</div>}
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <pre className="overflow-x-auto rounded bg-black/30 p-2 text-[11px]">
              {JSON.stringify(a.before ?? {}, null, 2)}
            </pre>
            <pre className="overflow-x-auto rounded bg-black/30 p-2 text-[11px]">
              {JSON.stringify(a.after ?? {}, null, 2)}
            </pre>
          </div>
        </details>
      ))}
    </div>
  );
}
