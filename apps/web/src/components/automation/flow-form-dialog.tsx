'use client';

import { useState, useEffect } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CHANNEL_OPTIONS,
  TRIGGER_OPTIONS,
  type AutomationFlowDetail,
  type MessageChannel,
  type AutomationTriggerType,
  type MessageTemplateDetail,
} from '@/types/automation-messaging';
import type { FlowInput } from '@/hooks/use-automation';

interface FlowFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: AutomationFlowDetail;
  templates: MessageTemplateDetail[];
  onSubmit: (data: FlowInput) => void;
  isPending?: boolean;
}

export function FlowFormDialog({
  open,
  onOpenChange,
  initial,
  templates,
  onSubmit,
  isPending,
}: FlowFormDialogProps) {
  const [form, setForm] = useState<FlowInput>({
    name: '',
    triggerType: 'LEAD_CREATED',
    delayMinutes: 0,
    isActive: true,
  });

  useEffect(() => {
    if (open) {
      setForm({
        name: initial?.name ?? '',
        triggerType: initial?.triggerType ?? 'LEAD_CREATED',
        messageTemplateId: initial?.messageTemplate?.id ?? '',
        channel: (initial?.channel as MessageChannel) ?? undefined,
        delayMinutes: initial?.delayMinutes ?? 0,
        isActive: initial?.isActive ?? true,
      });
    }
  }, [open, initial]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? 'Sửa automation flow' : 'Tạo automation flow'}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({
              ...form,
              messageTemplateId: form.messageTemplateId || undefined,
              channel: form.channel || undefined,
            });
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label>Tên flow *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Trigger *</Label>
            <Select
              value={form.triggerType}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, triggerType: v as AutomationTriggerType }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRIGGER_OPTIONS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Mẫu tin</Label>
            <Select
              value={form.messageTemplateId || 'none'}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, messageTemplateId: v === 'none' ? '' : v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Chọn mẫu" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Kênh</Label>
              <Select
                value={form.channel || 'auto'}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    channel: v === 'auto' ? undefined : (v as MessageChannel),
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Theo mẫu</SelectItem>
                  {CHANNEL_OPTIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Delay (phút)</Label>
              <Input
                type="number"
                min={0}
                value={form.delayMinutes ?? 0}
                onChange={(e) => setForm((f) => ({ ...f, delayMinutes: Number(e.target.value) }))}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isActive ?? true}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            />
            Đang hoạt động
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Đang lưu...' : 'Lưu'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
