'use client';

import { useCallback, useMemo, useState } from 'react';
import { Check, Copy, Landmark, Loader2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorState, LoadingState } from '@/components/shared/page-state';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { formatMutationError } from '@/lib/format-mutation-error';
import {
  useAffiliateCommissions,
  useAffiliateMe,
  useAffiliatePayouts,
  useAffiliateReferrals,
  useCreatePayout,
  useUpsertPayoutMethod,
} from '@/hooks/use-affiliate';
import {
  buildAffiliateLink,
  calcConversionRate,
  calcTotalEarned,
  canRequestWithdraw,
} from '@/components/affiliate/affiliate-ui-logic';

type Overview = {
  profile: {
    code: string;
    status: string;
    availableAmount: number;
    pendingAmount: number;
    paidAmount: number;
    payoutMethod?: {
      bankCode: string;
      bankName: string;
      accountNumber?: string;
      accountNumberMasked?: string;
      accountName: string;
      verifiedAt: string | null;
    } | null;
    referralLink?: string;
  };
  stats: {
    clicks: number;
    signups: number;
    paidCustomers: number;
    pendingCommission: number;
    availableCommission: number;
    payoutPendingCommission: number;
    paidCommission: number;
  };
  settings: {
    rate: number;
    holdDays: number;
    minPayoutVnd: number;
    publicBaseUrl: string;
  };
};

type Tab = 'overview' | 'referrals' | 'commissions' | 'payouts' | 'bank';

export function AffiliateDashboard() {
  const me = useAffiliateMe();
  const [tab, setTab] = useState<Tab>('overview');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);

  const data = me.data as Overview | undefined;
  const link = useMemo(() => {
    if (!data?.profile?.code) return '';
    if (data.profile.referralLink) return data.profile.referralLink;
    return buildAffiliateLink(data.settings?.publicBaseUrl || 'https://marketingautoaz.com', data.profile.code);
  }, [data]);

  const copyLink = useCallback(async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }, [link]);

  if (me.isLoading) return <LoadingState message="Đang tải Affiliate..." />;
  if (me.isError || !data?.profile) {
    return (
      <ErrorState
        message={formatMutationError(me.error, 'Không tải được Affiliate')}
        onRetry={() => void me.refetch()}
      />
    );
  }

  const stats = data.stats;
  const totalEarned = calcTotalEarned(stats);
  const conv = calcConversionRate(stats.signups, stats.clicks);
  const tabs: Array<[Tab, string]> = [
    ['overview', 'Tổng quan'],
    ['referrals', 'Giới thiệu'],
    ['commissions', 'Hoa hồng'],
    ['payouts', 'Rút tiền'],
    ['bank', 'Ngân hàng'],
  ];

  return (
    <div className="space-y-4 pb-8">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-[hsl(var(--heading))]">
          Chương trình Affiliate
        </h1>
        <p className="text-sm text-muted-foreground">
          Mã giới thiệu · hoa hồng · rút tiền · tỷ lệ {(data.settings.rate * 100).toFixed(1)}% · giữ{' '}
          {data.settings.holdDays} ngày
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1 space-y-1">
            <Label>Mã giới thiệu</Label>
            <Input readOnly value={data.profile.code} className="font-mono" />
          </div>
          <div className="min-w-[240px] flex-[2] space-y-1">
            <Label>Link Affiliate</Label>
            <Input readOnly value={link} />
          </div>
          <Button type="button" onClick={() => void copyLink()} className="bg-[#F97316] text-white">
            {copied ? <Check className="mr-1 h-4 w-4" /> : <Copy className="mr-1 h-4 w-4" />}
            {copied ? 'Đã sao chép' : 'Sao chép link'}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Trạng thái: <strong className="text-white">{data.profile.status}</strong>
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Tổng lượt click" value={String(stats.clicks)} />
        <StatCard label="Tổng đăng ký" value={`${stats.signups} (${conv}%)`} />
        <StatCard label="Khách đã thanh toán" value={String(stats.paidCustomers)} />
        <StatCard label="Hoa hồng chờ duyệt" value={formatCurrency(stats.pendingCommission)} />
        <StatCard label="Hoa hồng có thể rút" value={formatCurrency(stats.availableCommission)} />
        <StatCard label="Đang chờ chi" value={formatCurrency(stats.payoutPendingCommission)} />
        <StatCard label="Đã nhận" value={formatCurrency(stats.paidCommission)} />
        <StatCard label="Tổng hoa hồng" value={formatCurrency(totalEarned)} />
      </div>

      <nav className="flex flex-wrap gap-1 rounded-xl border border-white/10 bg-[#0A3D30] p-1.5">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setTab(k);
              setMsg('');
              setErr('');
            }}
            className={`rounded-lg px-3 py-2 text-xs font-medium sm:text-sm ${
              tab === k ? 'bg-white text-[#0A3D30]' : 'text-white/80 hover:bg-white/10'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {msg ? <p className="text-sm text-emerald-300">{msg}</p> : null}
      {err ? <p className="text-sm text-amber-200">{err}</p> : null}

      {tab === 'overview' && (
        <div className="rounded-xl border border-white/10 p-4 text-sm text-muted-foreground">
          <p>
            Chia sẻ link Affiliate. Khi khách đăng ký và thanh toán (SePay PAID), hệ thống tạo hoa
            hồng idempotent theo đơn. Sau {data.settings.holdDays} ngày giữ, hoa hồng chuyển sang
            số dư có thể rút (tối thiểu {formatCurrency(data.settings.minPayoutVnd)}).
          </p>
        </div>
      )}
      {tab === 'referrals' && <ReferralsPanel />}
      {tab === 'commissions' && <CommissionsPanel />}
      {tab === 'payouts' && (
        <PayoutsPanel
          overview={data}
          onMsg={setMsg}
          onErr={setErr}
        />
      )}
      {tab === 'bank' && (
        <BankPanel
          overview={data}
          onMsg={setMsg}
          onErr={setErr}
          onSaved={() => void me.refetch()}
        />
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function ReferralsPanel() {
  const q = useAffiliateReferrals(1);
  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState onRetry={() => void q.refetch()} />;
  const items =
    ((q.data as { items?: Array<Record<string, unknown>> })?.items as Array<{
      id: string;
      registeredAt: string;
      firstPaidAt: string | null;
      status: string;
      organization: { name: string; email: string };
    }>) || [];
  if (!items.length) {
    return <p className="text-sm text-muted-foreground">Chưa có lượt giới thiệu.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-white/5 text-xs text-muted-foreground">
          <tr>
            <th className="p-3">Tổ chức</th>
            <th className="p-3">Email</th>
            <th className="p-3">Đăng ký</th>
            <th className="p-3">Thanh toán đầu</th>
            <th className="p-3">TT</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr key={r.id} className="border-t border-white/5">
              <td className="p-3 text-white">{r.organization?.name}</td>
              <td className="p-3">{r.organization?.email}</td>
              <td className="p-3">{formatDateTime(r.registeredAt)}</td>
              <td className="p-3">{r.firstPaidAt ? formatDateTime(r.firstPaidAt) : '—'}</td>
              <td className="p-3">{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CommissionsPanel() {
  const q = useAffiliateCommissions(1);
  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState onRetry={() => void q.refetch()} />;
  const items =
    ((q.data as { items?: Array<Record<string, unknown>> })?.items as Array<{
      id: string;
      orderCode: string;
      commissionVnd: number;
      status: string;
      createdAt: string;
      holdUntil: string;
    }>) || [];
  if (!items.length) {
    return <p className="text-sm text-muted-foreground">Chưa có hoa hồng.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-white/5 text-xs text-muted-foreground">
          <tr>
            <th className="p-3">Mã đơn</th>
            <th className="p-3">Hoa hồng</th>
            <th className="p-3">Trạng thái</th>
            <th className="p-3">Giữ đến</th>
            <th className="p-3">Tạo lúc</th>
          </tr>
        </thead>
        <tbody>
          {items.map((c) => (
            <tr key={c.id} className="border-t border-white/5">
              <td className="p-3 font-mono text-white">{c.orderCode}</td>
              <td className="p-3">{formatCurrency(c.commissionVnd)}</td>
              <td className="p-3">{c.status}</td>
              <td className="p-3">{c.holdUntil ? formatDateTime(c.holdUntil) : '—'}</td>
              <td className="p-3">{formatDateTime(c.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PayoutsPanel({
  overview,
  onMsg,
  onErr,
}: {
  overview: Overview;
  onMsg: (s: string) => void;
  onErr: (s: string) => void;
}) {
  const list = useAffiliatePayouts(1);
  const create = useCreatePayout();
  const [amount, setAmount] = useState(String(overview.settings.minPayoutVnd || ''));
  const openItems =
    ((list.data as { items?: Array<{ status: string }> })?.items || []).filter((p) =>
      ['PENDING', 'APPROVED', 'PROCESSING'].includes(p.status),
    ) || [];
  const can = canRequestWithdraw({
    status: overview.profile.status,
    available: overview.stats.availableCommission,
    minPayout: overview.settings.minPayoutVnd,
    hasVerifiedBank: Boolean(overview.profile.payoutMethod?.verifiedAt),
    hasOpenPayout: openItems.length > 0,
  });

  const submit = async () => {
    onMsg('');
    onErr('');
    try {
      await create.mutateAsync({ amountVnd: Number(amount) });
      onMsg('Đã gửi yêu cầu rút tiền.');
      void list.refetch();
    } catch (e) {
      onErr(formatMutationError(e, 'Không tạo được yêu cầu rút'));
    }
  };

  const items =
    ((list.data as { items?: Array<Record<string, unknown>> })?.items as Array<{
      id: string;
      amountVnd: number;
      status: string;
      createdAt: string;
      rejectReason?: string | null;
    }>) || [];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 p-4">
        <div className="mb-3 flex items-center gap-2 text-white">
          <Wallet className="h-4 w-4 text-[#F97316]" />
          Yêu cầu rút tiền
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label>Số tiền (VND)</Label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min={overview.settings.minPayoutVnd}
            />
          </div>
          <Button
            type="button"
            disabled={!can || create.isPending}
            onClick={() => void submit()}
            className="bg-[#F97316] text-white"
          >
            {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Gửi yêu cầu
          </Button>
        </div>
        {!can ? (
          <p className="mt-2 text-xs text-amber-200">
            Cần: trạng thái ACTIVE, ngân hàng đã xác minh, đủ số dư tối thiểu, không có yêu cầu rút
            đang mở.
          </p>
        ) : null}
      </div>

      {list.isLoading ? <LoadingState /> : null}
      {items.length ? (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="bg-white/5 text-xs text-muted-foreground">
              <tr>
                <th className="p-3">Số tiền</th>
                <th className="p-3">Trạng thái</th>
                <th className="p-3">Thời gian</th>
                <th className="p-3">Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-t border-white/5">
                  <td className="p-3 text-white">{formatCurrency(p.amountVnd)}</td>
                  <td className="p-3">{p.status}</td>
                  <td className="p-3">{formatDateTime(p.createdAt)}</td>
                  <td className="p-3">{p.rejectReason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Chưa có yêu cầu rút.</p>
      )}
    </div>
  );
}

function BankPanel({
  overview,
  onMsg,
  onErr,
  onSaved,
}: {
  overview: Overview;
  onMsg: (s: string) => void;
  onErr: (s: string) => void;
  onSaved: () => void;
}) {
  const upsert = useUpsertPayoutMethod();
  const pm = overview.profile.payoutMethod;
  const [bankCode, setBankCode] = useState(pm?.bankCode || '');
  const [bankName, setBankName] = useState(pm?.bankName || '');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState(pm?.accountName || '');

  const save = async () => {
    onMsg('');
    onErr('');
    try {
      await upsert.mutateAsync({ bankCode, bankName, accountNumber, accountName });
      onMsg('Đã lưu thông tin ngân hàng.');
      onSaved();
    } catch (e) {
      onErr(formatMutationError(e, 'Không lưu được tài khoản ngân hàng'));
    }
  };

  return (
    <div className="max-w-xl space-y-3 rounded-xl border border-white/10 p-4">
      <div className="mb-1 flex items-center gap-2 text-white">
        <Landmark className="h-4 w-4 text-[#F97316]" />
        Tài khoản nhận hoa hồng
      </div>
      <div className="space-y-1">
        <Label>Mã ngân hàng (VD: VCB, TCB)</Label>
        <Input value={bankCode} onChange={(e) => setBankCode(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Tên ngân hàng</Label>
        <Input value={bankName} onChange={(e) => setBankName(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Số tài khoản {pm?.accountNumberMasked ? `(hiện tại ${pm.accountNumberMasked})` : ''}</Label>
        <Input
          value={accountNumber}
          onChange={(e) => setAccountNumber(e.target.value)}
          placeholder="Nhập lại số tài khoản để cập nhật"
        />
      </div>
      <div className="space-y-1">
        <Label>Chủ tài khoản</Label>
        <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} />
      </div>
      <Button
        type="button"
        disabled={upsert.isPending}
        onClick={() => void save()}
        className="bg-[#F97316] text-white"
      >
        {upsert.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Lưu tài khoản
      </Button>
    </div>
  );
}

export default AffiliateDashboard;
