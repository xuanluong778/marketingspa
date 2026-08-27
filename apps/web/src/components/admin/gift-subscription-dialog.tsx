'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { formatCredit, formatDateTime } from '@/lib/format';
import { useBillingPlans, type BillingPlan } from '@/hooks/use-billing';
import type { AdminSubscriptionItem } from '@/hooks/use-platform-admin';

export type GiftTimeUnit = 'days' | 'months' | 'years';

const UNIT_LABELS: Record<GiftTimeUnit, string> = {
  days: 'Ngày',
  months: 'Tháng',
  years: 'Năm',
};

const UNIT_TOAST: Record<GiftTimeUnit, string> = {
  days: 'ngày',
  months: 'tháng',
  years: 'năm',
};

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const YEAR_OPTIONS = ['1', '2', '3', '4', '5', 'permanent'];
const PERMANENT_END = new Date('2099-12-31T23:59:59.999Z');

function defaultAmountForUnit(unit: GiftTimeUnit): string {
  if (unit === 'months' || unit === 'years') return '1';
  return '30';
}

function addGiftDuration(base: Date, unit: GiftTimeUnit, amount: number): Date {
  const end = new Date(base);
  if (unit === 'days') end.setDate(end.getDate() + amount);
  else if (unit === 'months') end.setMonth(end.getMonth() + amount);
  else end.setFullYear(end.getFullYear() + amount);
  return end;
}

function isPermanentSelection(unit: GiftTimeUnit, amount: string): boolean {
  return unit === 'years' && amount === 'permanent';
}

function suggestedCreditGrant(
  unit: GiftTimeUnit,
  amount: string,
  plans: BillingPlan[] | undefined,
): number | null {
  if (!plans?.length) return null;
  const n = Number(amount);
  let plan: BillingPlan | undefined;
  if (unit === 'months' && n === 6) {
    plan =
      plans.find((p) => p.isActive && p.durationMonths === 6) ??
      plans.find((p) => p.code === 'msp-pro-6m');
  } else if ((unit === 'months' && n === 12) || (unit === 'years' && amount === '1')) {
    plan =
      plans.find((p) => p.isActive && p.durationMonths === 12) ??
      plans.find((p) => p.code === 'msp-pro-12m');
  }
  if (!plan) return null;
  const grant = Number(plan.creditGrant);
  return Number.isFinite(grant) && grant > 0 ? grant : null;
}

function projectedExpiry(
  sub: AdminSubscriptionItem,
  unit: GiftTimeUnit,
  amount: string,
): Date | 'permanent' | null {
  if (unit === 'years' && amount === 'permanent') return 'permanent';
  const amountNum = Number(amount);
  if (!Number.isFinite(amountNum) || amountNum < 1) return null;
  const now = new Date();
  const current = new Date(sub.expiresAt);
  const base = !sub.isExpired && current.getTime() > now.getTime() ? current : now;
  return addGiftDuration(base, unit, amountNum);
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscription: AdminSubscriptionItem | null;
  pending?: boolean;
  onConfirm: (payload: {
    amount: number;
    unit: GiftTimeUnit;
    permanent?: boolean;
    creditAmount: number;
    idempotencyKey: string;
  }) => void;
};

export function GiftSubscriptionDialog({
  open,
  onOpenChange,
  subscription,
  pending,
  onConfirm,
}: Props) {
  const { data: plans } = useBillingPlans();
  const [giftDuration, setGiftDuration] = useState(true);
  const [unit, setUnit] = useState<GiftTimeUnit>('days');
  const [amount, setAmount] = useState('30');
  const [creditAmount, setCreditAmount] = useState('0');
  const [creditDirty, setCreditDirty] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState('');

  useEffect(() => {
    if (!open) return;
    setGiftDuration(true);
    setUnit('days');
    setAmount('30');
    setCreditAmount('0');
    setCreditDirty(false);
    setIdempotencyKey(crypto.randomUUID());
  }, [open]);

  const suggested = useMemo(
    () => (giftDuration ? suggestedCreditGrant(unit, amount, plans) : null),
    [giftDuration, unit, amount, plans],
  );

  useEffect(() => {
    if (!open || creditDirty) return;
    if (suggested != null) {
      setCreditAmount(String(suggested));
      return;
    }
    if (giftDuration) setCreditAmount('0');
  }, [open, suggested, creditDirty, giftDuration]);

  const permanent = giftDuration && isPermanentSelection(unit, amount);
  const amountNum = Number(amount);
  const validAmount =
    !giftDuration ||
    permanent ||
    (Number.isFinite(amountNum) && amountNum > 0 && amount.trim() !== '');

  const previewEnd = useMemo(() => {
    if (!subscription || !giftDuration || !validAmount) return null;
    return projectedExpiry(subscription, unit, amount);
  }, [subscription, giftDuration, unit, amount, validAmount]);

  function handleUnitChange(next: GiftTimeUnit) {
    setUnit(next);
    setAmount(defaultAmountForUnit(next));
  }

  const creditNum = Number(creditAmount);
  const validCredit = Number.isFinite(creditNum) && creditNum >= 0 && Number.isInteger(creditNum);
  const willGiftCredit = validCredit && creditNum > 0;
  const canSubmit = (giftDuration && validAmount) || willGiftCredit;

  function handleConfirm() {
    if (!subscription || !canSubmit || !validCredit || pending) return;
    onConfirm({
      amount: giftDuration ? (permanent ? 0 : amountNum) : 0,
      unit,
      permanent: permanent || undefined,
      creditAmount: willGiftCredit ? creditNum : 0,
      idempotencyKey: idempotencyKey || crypto.randomUUID(),
    });
  }

  const currentBalance = Number(subscription?.creditBalance ?? 0);
  const afterBalance = currentBalance + (willGiftCredit ? creditNum : 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>🎁 Quà tặng</DialogTitle>
        </DialogHeader>
        {subscription && (
          <div className="space-y-4 text-sm">
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="font-medium">{subscription.organization?.name ?? '—'}</p>
              <p className="text-xs text-muted-foreground">
                {subscription.planName} · {subscription.status}
              </p>
            </div>

            <section className="space-y-3 rounded-md border p-3">
              <label className="flex items-center gap-2 font-medium">
                <input
                  type="checkbox"
                  checked={giftDuration}
                  onChange={(e) => setGiftDuration(e.target.checked)}
                />
                Tặng thời hạn
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Loại</Label>
                  <Select
                    value={unit}
                    onValueChange={(v) => handleUnitChange(v as GiftTimeUnit)}
                    disabled={!giftDuration}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(UNIT_LABELS) as GiftTimeUnit[]).map((u) => (
                        <SelectItem key={u} value={u}>
                          {UNIT_LABELS[u]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Số lượng</Label>
                  {unit === 'months' ? (
                    <Select value={amount} onValueChange={setAmount} disabled={!giftDuration}>
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn tháng" />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTH_OPTIONS.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m} tháng
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : unit === 'years' ? (
                    <Select value={amount} onValueChange={setAmount} disabled={!giftDuration}>
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn năm" />
                      </SelectTrigger>
                      <SelectContent>
                        {YEAR_OPTIONS.map((y) => (
                          <SelectItem key={y} value={y}>
                            {y === 'permanent' ? 'Vĩnh viễn' : `${y} năm`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      type="number"
                      min={1}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="VD: 30"
                      disabled={!giftDuration}
                    />
                  )}
                </div>
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Hạn hiện tại</span>
                  <span className="font-medium">{formatDateTime(subscription.expiresAt)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Hạn mới dự kiến</span>
                  <span className="font-medium text-primary">
                    {!giftDuration
                      ? 'Không thay đổi'
                      : previewEnd === 'permanent'
                        ? 'Vĩnh viễn'
                        : previewEnd
                          ? formatDateTime(previewEnd.toISOString())
                          : '—'}
                  </span>
                </div>
                {giftDuration && subscription.isExpired && (
                  <p className="text-amber-600">
                    Gói đã hết hạn — thời gian tặng sẽ tính từ thời điểm hiện tại.
                  </p>
                )}
              </div>
            </section>

            <section className="space-y-3 rounded-md border p-3">
              <p className="font-medium">Tặng AI Credit</p>
              <div className="space-y-1.5">
                <Label>Số Credit muốn tặng</Label>
                <Input
                  type="number"
                  min={0}
                  step="1"
                  value={creditAmount}
                  onChange={(e) => {
                    setCreditDirty(true);
                    setCreditAmount(e.target.value);
                  }}
                  placeholder="VD: 30000"
                />
                {suggested != null && !creditDirty && (
                  <p className="text-xs text-muted-foreground">
                    Gợi ý từ gói tương ứng: {formatCredit(suggested)} Credit (có thể sửa).
                  </p>
                )}
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Credit hiện tại</span>
                  <span className="font-medium">{formatCredit(currentBalance)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Credit sau khi tặng</span>
                  <span className="font-medium text-primary">{formatCredit(afterBalance)}</span>
                </div>
              </div>
            </section>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Hủy
          </Button>
          <Button onClick={handleConfirm} disabled={!canSubmit || !validCredit || pending}>
            Xác nhận tặng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function giftSuccessMessage(
  amount: number,
  unit: GiftTimeUnit,
  permanent?: boolean,
  creditAmount?: number,
): string {
  const credit =
    creditAmount && creditAmount > 0 ? `${creditAmount.toLocaleString('vi-VN')} AI Credit` : '';
  const duration = permanent
    ? 'thời hạn vĩnh viễn'
    : amount >= 1
      ? `${amount} ${UNIT_TOAST[unit]}`
      : '';
  if (duration && credit) {
    return `Đã tặng ${duration} và ${credit}.`;
  }
  if (credit) return `Đã tặng ${credit}.`;
  if (duration) return `Đã tặng ${duration} và kích hoạt gói thành công.`;
  return 'Đã tặng thành công.';
}

export { PERMANENT_END };
