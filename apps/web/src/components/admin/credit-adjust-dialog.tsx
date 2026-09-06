'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatCredit } from '@/lib/format';
import type { AdminCreditOrgItem } from '@/hooks/use-platform-admin';

type Props = {
  open: boolean;
  mode: 'grant' | 'debit';
  org: AdminCreditOrgItem | null;
  pending?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (payload: { delta: number; reason: string; idempotencyKey: string }) => void;
};

export function AdminCreditAdjustDialog({
  open,
  mode,
  org,
  pending,
  onOpenChange,
  onConfirm,
}: Props) {
  const [amount, setAmount] = useState('');

  useEffect(() => {
    if (!open) setAmount('');
  }, [open]);

  const amountNum = Number(amount);
  const validAmount = Number.isFinite(amountNum) && amountNum > 0;
  const title = mode === 'grant' ? 'Tặng / Cộng Credit' : 'Trừ Credit';

  function handleConfirm() {
    if (!org || !validAmount) return;
    onConfirm({
      delta: mode === 'grant' ? amountNum : -amountNum,
      reason: mode === 'grant' ? 'Tặng Credit' : 'Trừ Credit',
      idempotencyKey: crypto.randomUUID(),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {org && (
          <div className="space-y-4 text-sm">
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="font-medium">{org.name}</p>
              <p className="text-xs text-muted-foreground">{org.email ?? org.slug}</p>
              <p className="mt-1 text-xs">
                Credit hiện tại: <strong>{formatCredit(org.balance)}</strong>
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Số Credit</Label>
              <Input
                type="number"
                min={1}
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="VD: 500"
              />
            </div>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Hủy
          </Button>
          <Button onClick={handleConfirm} disabled={!validAmount || pending}>
            Xác nhận
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
