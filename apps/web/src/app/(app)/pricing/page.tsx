'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Check, CheckCircle2, Copy, Loader2, Sparkles } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatCurrency, formatDateTime } from '@/lib/format';
import {
  useActivateTrial,
  useBillingPlans,
  useCancelPaymentOrder,
  useCreatePaymentOrder,
  useCurrentSubscription,
  usePaymentOrder,
  type BillingPlan,
  type PaymentOrder,
} from '@/hooks/use-billing';
import { LoadingState, ErrorState } from '@/components/shared/page-state';
import { useCurrentUser } from '@/hooks/use-auth';
import { useRouter, useSearchParams } from 'next/navigation';
import { authStorage } from '@/lib/auth-storage';
import { getDeviceFingerprint } from '@/lib/device-fingerprint';

const FEATURE_ROWS: { label: string; included: boolean }[] = [
  { label: 'CRM & Lead & Phễu marketing', included: true },
  { label: 'Quảng cáo (Ads) & Attribution', included: true },
  { label: 'Chatbot CSKH & Nhắn tin hàng loạt', included: true },
  { label: 'Content & Auto Post Fanpage', included: true },
  { label: 'Quản lý nhân sự (HRM)', included: true },
  { label: 'Báo cáo & Mục tiêu kinh doanh', included: true },
  { label: 'Hỗ trợ kích hoạt tự động qua SePay', included: true },
];

const STATUS_CLASS: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-900',
  PAID: 'bg-emerald-100 text-emerald-900',
  EXPIRED: 'bg-slate-100 text-slate-700',
  CANCELLED: 'bg-slate-100 text-slate-600',
  REVIEW_REQUIRED: 'bg-orange-100 text-orange-900',
};

function planPrice(p: BillingPlan) {
  return Number(p.priceVnd);
}

function PaymentSuccessDialog({
  open,
  order,
  userName,
  onClose,
}: {
  open: boolean;
  order: PaymentOrder | null;
  userName?: string;
  onClose: () => void;
}) {
  const name = userName?.trim() || 'bạn';
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md text-center sm:text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 className="h-9 w-9 text-emerald-600" />
        </div>
        <DialogHeader className="space-y-2">
          <DialogTitle className="text-center text-xl text-emerald-800">
            Thanh toán thành công!
          </DialogTitle>
          <DialogDescription className="text-center text-base text-foreground/80">
            Cảm ơn {name} đã tin tưởng và đồng hành cùng Marketing SPA.
            <br />
            Gói của bạn đã được kích hoạt tự động.
          </DialogDescription>
        </DialogHeader>
        {order && (
          <div className="rounded-lg border bg-muted/40 px-4 py-3 text-left text-sm space-y-1.5">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Mã đơn</span>
              <span className="font-mono font-medium">{order.code}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Số tiền</span>
              <span className="font-medium">{formatCurrency(order.amountVnd)}</span>
            </div>
            {order.plan && (
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Gói</span>
                <span className="font-medium text-right">{order.plan.name}</span>
              </div>
            )}
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          Chúc bạn kinh doanh thuận lợi và tận dụng tối đa các tính năng Pro.
        </p>
        <DialogFooter className="sm:justify-center">
          <Button className="w-full bg-teal-700 hover:bg-teal-800 sm:w-auto" onClick={onClose}>
            Tiếp tục sử dụng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentModal({
  orderId,
  open,
  onOpenChange,
  userName,
}: {
  orderId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userName?: string;
}) {
  const qc = useQueryClient();
  const { data: order, isLoading } = usePaymentOrder(orderId, { poll: true });
  const cancelMut = useCancelPaymentOrder();
  const [copied, setCopied] = useState<string | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const celebratedOrderId = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSuccessOpen(false);
      celebratedOrderId.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (order?.status !== 'PAID' || !order.id) return;
    if (celebratedOrderId.current === order.id) return;
    celebratedOrderId.current = order.id;
    setSuccessOpen(true);
    void qc.invalidateQueries({ queryKey: ['billing', 'subscription'] });
    void qc.invalidateQueries({ queryKey: ['billing', 'orders'] });
  }, [order?.status, order?.id, qc]);

  async function copy(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  function closeSuccess() {
    setSuccessOpen(false);
    onOpenChange(false);
  }

  return (
    <>
      <Dialog
        open={open && !successOpen}
        onOpenChange={(v) => {
          if (!v && successOpen) return;
          onOpenChange(v);
        }}
      >
        <DialogContent className="flex max-h-[min(92vh,720px)] w-[calc(100%-1.5rem)] max-w-2xl flex-col gap-3 overflow-hidden p-4 sm:p-5">
          <DialogHeader className="space-y-1 pr-6 text-left">
            <DialogTitle className="text-base sm:text-lg">Thanh toán đơn hàng</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Quét VietQR hoặc chuyển khoản đúng số tiền và nội dung để kích hoạt tự động.
            </DialogDescription>
          </DialogHeader>

          {isLoading || !order ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Đang tải đơn...
            </div>
          ) : (
            <PaymentOrderBody
              order={order}
              copied={copied}
              onCopy={copy}
              onCancel={() =>
                cancelMut.mutate(order.id, {
                  onSuccess: () => {
                    onOpenChange(false);
                  },
                })
              }
              cancelling={cancelMut.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      <PaymentSuccessDialog
        open={successOpen}
        order={order ?? null}
        userName={userName}
        onClose={closeSuccess}
      />
    </>
  );
}

function PaymentOrderBody({
  order,
  copied,
  onCopy,
  onCancel,
  cancelling,
}: {
  order: PaymentOrder;
  copied: string | null;
  onCopy: (text: string, key: string) => void;
  onCancel: () => void;
  cancelling: boolean;
}) {
  return (
    <div className="min-h-0 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground sm:text-sm">Trạng thái</span>
        <span
          className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[order.status] ?? ''}`}
        >
          {order.statusLabel}
        </span>
      </div>

      <div className="grid items-start gap-3 sm:grid-cols-[auto_1fr] sm:gap-4">
        {order.qrUrl && order.status === 'PENDING' && (
          <div className="mx-auto flex shrink-0 justify-center rounded-lg border bg-white p-1.5 sm:mx-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={order.qrUrl}
              alt="VietQR"
              className="h-[148px] w-[148px] object-contain sm:h-[168px] sm:w-[168px]"
            />
          </div>
        )}

        <dl className="min-w-0 space-y-0 text-sm">
          <Row
            label="Mã đơn"
            value={order.code}
            copyKey="code"
            copied={copied}
            onCopy={onCopy}
          />
          <Row
            label="Số tiền"
            value={`${formatCurrency(order.amountVnd)}`}
            copyKey="amount"
            copied={copied}
            onCopy={() => onCopy(String(order.amountVnd), 'amount')}
          />
          <Row
            label="Nội dung CK"
            value={order.transferContent}
            copyKey="content"
            copied={copied}
            onCopy={onCopy}
          />
          <Row
            label="Số TK"
            value={order.accountNumber}
            copyKey="account"
            copied={copied}
            onCopy={onCopy}
          />
          <Row
            label="Chủ TK"
            value={order.accountName}
            copyKey="name"
            copied={copied}
            onCopy={onCopy}
          />
          <div className="flex justify-between gap-2 border-b border-dashed py-1 text-xs sm:text-sm">
            <dt className="text-muted-foreground shrink-0">Ngân hàng</dt>
            <dd className="font-medium">{order.bankCode}</dd>
          </div>
          <div className="flex justify-between gap-2 py-1 text-xs sm:text-sm">
            <dt className="text-muted-foreground shrink-0">Hết hạn</dt>
            <dd className="font-medium text-right">{formatDateTime(order.expiresAt)}</dd>
          </div>
          {order.plan && (
            <div className="flex justify-between gap-2 py-1 text-xs sm:text-sm">
              <dt className="text-muted-foreground shrink-0">Gói</dt>
              <dd className="font-medium text-right leading-snug">{order.plan.name}</dd>
            </div>
          )}
        </dl>
      </div>

      {order.reviewNote && (
        <p className="rounded-md bg-orange-50 p-2 text-xs text-orange-900">{order.reviewNote}</p>
      )}

      {order.status === 'PENDING' && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={onCancel}
          disabled={cancelling}
        >
          Hủy đơn
        </Button>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  copyKey,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copyKey: string;
  copied: string | null;
  onCopy: (text: string, key: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-dashed py-1 text-xs sm:text-sm">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1 font-medium">
        <span className="truncate text-right">{value}</span>
        <button
          type="button"
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted"
          onClick={() => onCopy(value, copyKey)}
          aria-label="Copy"
        >
          {copied === copyKey ? (
            <Check className="h-3.5 w-3.5 text-emerald-600" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </dd>
    </div>
  );
}

function TrialCard({
  sub,
  onActivate,
  activating,
}: {
  sub: NonNullable<ReturnType<typeof useCurrentSubscription>['data']>;
  onActivate: () => void;
  activating: boolean;
}) {
  const trial = sub.trial;
  const status = sub.subscriptionStatus ?? sub.status;

  // Đã kích hoạt / đang trial / hết trial → ẩn CTA kích hoạt
  if (!trial?.enabled) return null;
  if (status === 'ACTIVE' || status === 'EXPIRING') return null;

  if (status === 'TRIALING' && trial) {
    return (
      <section className="rounded-2xl border border-teal-400/50 bg-[#0A3D31] p-6 text-white shadow-md">
        <h2 className="text-lg font-semibold text-heading">Đang dùng thử miễn phí 3 ngày</h2>
        <p className="mt-1 text-sm text-white/80">
          Bạn đang được dùng Content cơ bản trong thời gian dùng thử.
        </p>
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-2 sm:block">
            <dt className="text-white/65">Bắt đầu</dt>
            <dd className="font-medium text-white">
              {trial.trialStartedAt ? formatDateTime(trial.trialStartedAt) : '—'}
            </dd>
          </div>
          <div className="flex justify-between gap-2 sm:block">
            <dt className="text-white/65">Kết thúc</dt>
            <dd className="font-medium text-white">
              {trial.trialEndsAt ? formatDateTime(trial.trialEndsAt) : '—'}
            </dd>
          </div>
          <div className="flex justify-between gap-2 sm:block">
            <dt className="text-white/65">Còn lại</dt>
            <dd className="font-semibold text-emerald-300">
              {trial.remainingDays} ngày ({trial.remainingHours} giờ)
            </dd>
          </div>
          <div className="flex justify-between gap-2 sm:block">
            <dt className="text-white/65">Quyền dùng thử</dt>
            <dd className="font-medium text-white">Content &amp; Auto Post</dd>
          </div>
        </dl>
        {trial.warningWithin24h && (
          <p className="mt-3 rounded-md border border-amber-300/40 bg-amber-400/15 px-3 py-2 text-sm text-amber-100">
            Dùng thử còn dưới 24 giờ. Nâng cấp ngay để không bị gián đoạn.
          </p>
        )}
        <Button
          className="mt-4 bg-heading text-white hover:bg-heading/90 hover:text-white"
          asChild
        >
          <a href="#plans">Nâng cấp ngay</a>
        </Button>
      </section>
    );
  }

  if (status === 'TRIAL_EXPIRED' || trial?.status === 'USED' || trial?.activated) {
    return (
      <section className="rounded-2xl border border-red-400/50 bg-[#0A3D31] p-6 text-white shadow-md">
        <h2 className="text-lg font-semibold text-red-300">Dùng thử đã kết thúc</h2>
        <p className="mt-2 text-sm text-white/90">
          Thời gian dùng thử đã kết thúc. Vui lòng thanh toán để tiếp tục sử dụng MarketingAutoAZ.
        </p>
        {trial?.trialEndsAt && (
          <p className="mt-2 text-xs text-white/65">
            Kết thúc lúc {formatDateTime(trial.trialEndsAt)}
          </p>
        )}
        <Button
          className="mt-4 bg-heading text-white hover:bg-heading/90 hover:text-white"
          asChild
        >
          <a href="#plans">Thanh toán ngay</a>
        </Button>
      </section>
    );
  }

  if (!trial?.eligible) return null;

  return (
    <section className="rounded-2xl border border-teal-400/50 bg-[#0A3D31] p-6 text-white shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Badge className="mb-2 border-0 bg-emerald-400/20 text-emerald-200 hover:bg-emerald-400/20">
            Miễn phí
          </Badge>
          <h2 className="text-xl font-semibold text-heading">Dùng thử miễn phí 3 ngày</h2>
          <p className="mt-1 max-w-xl text-sm text-white/80">
            Kích hoạt khi bạn sẵn sàng — thời gian chỉ bắt đầu sau khi bạn bấm nút. Mỗi email /
            thiết bị chỉ được dùng thử một lần.
          </p>
          <ul className="mt-3 space-y-1 text-sm text-white">
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
              Content Marketing cơ bản
            </li>
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
              Auto Post Fanpage
            </li>
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
              {trial.trialDays} ngày kể từ lúc kích hoạt
            </li>
          </ul>
        </div>
        <Button
          className="bg-heading text-white hover:bg-heading/90 hover:text-white"
          onClick={onActivate}
          disabled={activating}
        >
          {activating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Đang kích hoạt...
            </>
          ) : (
            'Kích hoạt dùng thử 3 ngày'
          )}
        </Button>
      </div>
    </section>
  );
}

function PricingPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: user, isLoading: authLoading } = useCurrentUser();
  const { data: plans, isLoading, isError, refetch } = useBillingPlans();
  const { data: sub } = useCurrentSubscription();
  const createOrder = useCreatePaymentOrder();
  const activateTrial = useActivateTrial();
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const upgradeStarted = useRef(false);
  const reason = searchParams.get('reason');

  const sorted = useMemo(
    () =>
      (plans ?? [])
        .filter((p) => [6, 12].includes(p.durationMonths))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.durationMonths - b.durationMonths),
    [plans],
  );

  async function register(plan: BillingPlan) {
    if (!authStorage.isAuthenticated() && !user) {
      router.push('/login?next=/pricing');
      return;
    }
    try {
      const order = await createOrder.mutateAsync(plan.code);
      setActiveOrderId(order.id);
      setModalOpen(true);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Không tạo được đơn');
    }
  }

  // Deep-link từ menu tài khoản: /pricing?upgrade=msp-pro-12m
  useEffect(() => {
    const code = searchParams.get('upgrade');
    if (!code || upgradeStarted.current || !plans?.length) return;
    if (!authStorage.isAuthenticated() && !user) return;
    const plan = plans.find((p) => p.code === code);
    if (!plan) return;
    upgradeStarted.current = true;
    void register(plan).finally(() => {
      router.replace('/pricing', { scroll: false });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy khi có query upgrade
  }, [searchParams, plans, user]);

  if (isLoading || authLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={refetch} />;

  async function handleActivateTrial() {
    if (!authStorage.isAuthenticated() && !user) {
      router.push('/login?next=/pricing');
      return;
    }
    try {
      await activateTrial.mutateAsync(getDeviceFingerprint());
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Không kích hoạt được dùng thử');
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-10 pb-12">
      <header className="space-y-3 text-center">
        <p className="text-sm font-medium tracking-wide text-teal-700">Marketing SPA Pro</p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Bảng giá</h1>
        <p className="mx-auto max-w-2xl text-muted-foreground">
          Một gói Pro — chọn chu kỳ 6 hoặc 12 tháng. Thanh toán chuyển khoản VietQR, kích hoạt tự
          động qua SePay.
        </p>
        {reason === 'trial_expired' && (
          <p className="mx-auto max-w-2xl rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
            Thời gian dùng thử đã kết thúc. Vui lòng thanh toán để tiếp tục sử dụng MarketingAutoAZ.
          </p>
        )}
        {reason === 'subscription_required' && (
          <p className="mx-auto max-w-2xl rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Vui lòng thanh toán hoặc kích hoạt dùng thử 3 ngày để sử dụng tính năng.
          </p>
        )}
        {sub?.hasPlan && !sub.isExpired && sub.expiresAt && sub.status !== 'TRIALING' && (
          <p className="text-sm text-emerald-700">
            Gói hiện tại: {sub.planName ?? sub.plan?.name ?? 'Pro'} — còn {sub.remainingDays} ngày
            (đến {formatDateTime(sub.expiresAt)})
          </p>
        )}
      </header>

      {sub && (
        <TrialCard
          sub={sub}
          onActivate={() => void handleActivateTrial()}
          activating={activateTrial.isPending}
        />
      )}

      <div id="plans" className="grid gap-6 md:grid-cols-2">
        {sorted.map((plan) => {
          const recommended = Boolean(plan.highlightLabel);
          const savings = plan.savingsAmount ? Number(plan.savingsAmount) : 0;
          return (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-2xl border border-teal-400/50 bg-[#0A3D31] p-6 text-white shadow-md ${
                recommended ? 'ring-1 ring-heading/50' : ''
              }`}
            >
              {recommended && (
                <Badge className="absolute -top-2.5 right-4 border-0 bg-heading text-white hover:bg-heading">
                  <Sparkles className="mr-1 h-3 w-3" />
                  {plan.highlightLabel}
                </Badge>
              )}
              <h2 className="text-xl font-semibold text-heading">{plan.name}</h2>
              <p className="mt-1 text-sm text-white/75">{plan.durationMonths} tháng sử dụng</p>
              <div className="mt-4">
                <span className="text-3xl font-bold tracking-tight text-white">
                  {formatCurrency(planPrice(plan))}
                </span>
                <span className="text-white/75"> / {plan.durationMonths} tháng</span>
              </div>
              {savings > 0 && (
                <p className="mt-2 text-sm font-medium text-emerald-300">
                  Tiết kiệm {formatCurrency(savings)} so với mua 2 gói 6 tháng
                </p>
              )}
              {Number(plan.creditGrant) > 0 && (
                <p className="mt-2 text-sm text-heading">
                  Tặng {Number(plan.creditGrant).toLocaleString('vi-VN')} AI Credit
                </p>
              )}
              <ul className="mt-5 flex-1 space-y-2 text-sm text-white/95">
                {FEATURE_ROWS.map((f) => (
                  <li key={f.label} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                    <span>{f.label}</span>
                  </li>
                ))}
              </ul>
              <Button
                className={`mt-6 w-full text-white hover:text-white ${
                  recommended
                    ? 'bg-heading hover:bg-heading/90'
                    : 'bg-teal-500 hover:bg-teal-400'
                }`}
                onClick={() => register(plan)}
                disabled={createOrder.isPending}
              >
                {createOrder.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Đang tạo đơn...
                  </>
                ) : (
                  'Đăng ký ngay'
                )}
              </Button>
            </div>
          );
        })}
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">So sánh quyền lợi</h2>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Quyền lợi</th>
                <th className="px-4 py-3 text-center font-medium">6 tháng</th>
                <th className="px-4 py-3 text-center font-medium">12 tháng</th>
              </tr>
            </thead>
            <tbody>
              {FEATURE_ROWS.map((row) => (
                <tr key={row.label} className="border-t">
                  <td className="px-4 py-2.5">{row.label}</td>
                  <td className="px-4 py-2.5 text-center text-teal-700">✓</td>
                  <td className="px-4 py-2.5 text-center text-teal-700">✓</td>
                </tr>
              ))}
              <tr className="border-t bg-muted/30">
                <td className="px-4 py-2.5 font-medium">Giá</td>
                <td className="px-4 py-2.5 text-center font-medium">
                  {sorted.find((p) => p.durationMonths === 6)
                    ? formatCurrency(Number(sorted.find((p) => p.durationMonths === 6)!.priceVnd))
                    : '—'}
                </td>
                <td className="px-4 py-2.5 text-center font-medium">
                  {sorted.find((p) => p.durationMonths === 12)
                    ? formatCurrency(Number(sorted.find((p) => p.durationMonths === 12)!.priceVnd))
                    : '—'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Hai chu kỳ dùng cùng toàn bộ tính năng; chỉ khác giá và thời hạn. Sau khi chuyển khoản đúng,
          hệ thống kích hoạt/gia hạn gói qua webhook SePay — frontend không tự kích hoạt.
        </p>
      </section>

      <PaymentModal
        orderId={activeOrderId}
        open={modalOpen}
        onOpenChange={setModalOpen}
        userName={user?.name}
      />
    </div>
  );
}

export default function PricingPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <PricingPageInner />
    </Suspense>
  );
}
