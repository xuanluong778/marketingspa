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
import { useT } from '@/i18n/i18n-provider';
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
  const t = useT();
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

  if (me.isLoading) return <LoadingState message={t('affiliate.loading')} />;
  if (me.isError || !data?.profile) {
    return (
      <ErrorState
        message={formatMutationError(me.error, t('affiliate.loadFailed'))}
        onRetry={() => void me.refetch()}
      />
    );
  }

  const stats = data.stats;
  const totalEarned = calcTotalEarned(stats);
  const conv = calcConversionRate(stats.signups, stats.clicks);
  const tabs: Array<[Tab, string]> = [
    ['overview', t('affiliateDash.overview')],
    ['referrals', t('affiliateDash.referrals')],
    ['commissions', t('affiliateDash.commission')],
    ['payouts', t('affiliateDash.withdraw')],
    ['bank', t('affiliateDash.bank')],
  ];

  return (
    <div className="space-y-4 pb-8">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-[hsl(var(--heading))]">
          {t('affiliate.title')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('affiliateDash.subtitle', {
            rate: (data.settings.rate * 100).toFixed(1),
            days: data.settings.holdDays,
          })}
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1 space-y-1">
            <Label>{t('affiliateDash.referralCode')}</Label>
            <Input readOnly value={data.profile.code} className="font-mono" />
          </div>
          <div className="min-w-[240px] flex-[2] space-y-1">
            <Label>{t('affiliate.linkLabel')}</Label>
            <Input readOnly value={link} />
          </div>
          <Button type="button" onClick={() => void copyLink()} className="bg-[#F97316] text-white">
            {copied ? <Check className="mr-1 h-4 w-4" /> : <Copy className="mr-1 h-4 w-4" />}
            {copied ? t('affiliateDash.copied') : t('affiliateDash.copyLink')}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {t('affiliateDash.status')}: <strong className="text-white">{data.profile.status}</strong>
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t('affiliateDash.totalClicks')} value={String(stats.clicks)} />
        <StatCard label={t('affiliateDash.totalSignups')} value={`${stats.signups} (${conv}%)`} />
        <StatCard label={t('affiliateDash.customerPaid')} value={String(stats.paidCustomers)} />
        <StatCard label={t('affiliateDash.pendingApproval')} value={formatCurrency(stats.pendingCommission)} />
        <StatCard label={t('affiliateDash.withdrawable')} value={formatCurrency(stats.availableCommission)} />
        <StatCard label={t('affiliateDash.pendingPayout')} value={formatCurrency(stats.payoutPendingCommission)} />
        <StatCard label={t('affiliateDash.received')} value={formatCurrency(stats.paidCommission)} />
        <StatCard label={t('affiliateDash.totalCommission')} value={formatCurrency(totalEarned)} />
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
            {t('affiliateDash.shareDetail', {
              holdDays: data.settings.holdDays,
              minPayout: formatCurrency(data.settings.minPayoutVnd),
            })}
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
  const t = useT();
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
    return <p className="text-sm text-muted-foreground">{t('affiliateDash.emptyReferrals')}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-white/5 text-xs text-muted-foreground">
          <tr>
            <th className="p-3">{t('affiliateDash.organization')}</th>
            <th className="p-3">{t('common.email')}</th>
            <th className="p-3">{t('affiliateDash.signup')}</th>
            <th className="p-3">{t('affiliateDash.firstPayment')}</th>
            <th className="p-3">{t('common.status')}</th>
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
  const t = useT();
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
    return <p className="text-sm text-muted-foreground">{t('affiliateDash.emptyCommission')}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-white/5 text-xs text-muted-foreground">
          <tr>
            <th className="p-3">{t('affiliateDash.orderCode')}</th>
            <th className="p-3">{t('affiliateDash.commission')}</th>
            <th className="p-3">{t('affiliateDash.status')}</th>
            <th className="p-3">{t('affiliateDash.holdUntil')}</th>
            <th className="p-3">{t('affiliateDash.createdAt')}</th>
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
  const t = useT();
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
      onMsg(t('affiliateDash.withdrawSubmitted'));
      void list.refetch();
    } catch (e) {
      onErr(formatMutationError(e, t('affiliateDash.withdrawFailed')));
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
          {t('affiliateDash.requestWithdraw')}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label>{t('affiliateDash.amountVnd')}</Label>
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
            {t('affiliateDash.sendRequest')}
          </Button>
        </div>
        {!can ? (
          <p className="mt-2 text-xs text-amber-200">{t('affiliateDash.withdrawRules')}</p>
        ) : null}
      </div>

      {list.isLoading ? <LoadingState /> : null}
      {!list.isLoading && items.length ? (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="bg-white/5 text-xs text-muted-foreground">
              <tr>
                <th className="p-3">{t('affiliateDash.amount')}</th>
                <th className="p-3">{t('affiliateDash.status')}</th>
                <th className="p-3">{t('affiliateDash.time')}</th>
                <th className="p-3">{t('affiliateDash.note')}</th>
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
      ) : null}
      {!list.isLoading && !items.length ? (
        <p className="text-sm text-muted-foreground">{t('affiliateDash.emptyWithdraw')}</p>
      ) : null}
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
  const t = useT();
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
      onMsg(t('affiliateDash.bankSaved'));
      onSaved();
    } catch (e) {
      onErr(formatMutationError(e, t('affiliateDash.bankSaveFailed')));
    }
  };

  return (
    <div className="max-w-xl space-y-3 rounded-xl border border-white/10 p-4">
      <div className="mb-1 flex items-center gap-2 text-white">
        <Landmark className="h-4 w-4 text-[#F97316]" />
        {t('affiliateDash.bankAccountTitle')}
      </div>
      <div className="space-y-1">
        <Label>{t('affiliateDash.bankCodeHint')}</Label>
        <Input value={bankCode} onChange={(e) => setBankCode(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>{t('affiliateDash.bankName')}</Label>
        <Input value={bankName} onChange={(e) => setBankName(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>
          {t('affiliateDash.accountNumber')}
          {pm?.accountNumberMasked
            ? ` ${t('affiliateDash.currentMasked', { masked: pm.accountNumberMasked })}`
            : ''}
        </Label>
        <Input
          value={accountNumber}
          onChange={(e) => setAccountNumber(e.target.value)}
          placeholder={t('affiliateDash.reenterAccount')}
        />
      </div>
      <div className="space-y-1">
        <Label>{t('affiliateDash.accountHolder')}</Label>
        <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} />
      </div>
      <Button
        type="button"
        disabled={upsert.isPending}
        onClick={() => void save()}
        className="bg-[#F97316] text-white"
      >
        {upsert.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {t('affiliateDash.saveAccount')}
      </Button>
    </div>
  );
}

export default AffiliateDashboard;
