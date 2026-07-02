'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  TEMPLATE_VARIABLES,
  type MessageTemplateDetail,
  type MessageChannel,
} from '@/types/automation-messaging';
import type { TemplateInput } from '@/hooks/use-automation';

interface TemplateFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: MessageTemplateDetail;
  onSubmit: (data: TemplateInput) => void;
  isPending?: boolean;
}

export function TemplateFormDialog({
  open,
  onOpenChange,
  initial,
  onSubmit,
  isPending,
}: TemplateFormDialogProps) {
  const [form, setForm] = useState<TemplateInput>({
    name: '',
    channel: 'ZALO',
    body: '',
    isActive: true,
  });

  useEffect(() => {
    if (open) {
      setForm({
        name: initial?.name ?? '',
        channel: (initial?.channel as MessageChannel) ?? 'ZALO',
        subject: initial?.subject ?? '',
        body: initial?.body ?? '',
        isActive: initial?.isActive ?? true,
      });
    }
  }, [open, initial]);

  function insertVariable(placeholder: string) {
    setForm((f) => ({ ...f, body: `${f.body}${placeholder}` }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? 'Sửa mẫu tin' : 'Tạo mẫu tin'}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(form);
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label>Tên mẫu *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Kênh *</Label>
            <Select
              value={form.channel}
              onValueChange={(v) => setForm((f) => ({ ...f, channel: v as MessageChannel }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHANNEL_OPTIONS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {form.channel === 'EMAIL' && (
            <div className="space-y-2">
              <Label>Tiêu đề</Label>
              <Input
                value={form.subject ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label>Biến động</Label>
            <div className="flex flex-wrap gap-1">
              {TEMPLATE_VARIABLES.map((v) => (
                <Button
                  key={v.key}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => insertVariable(v.placeholder)}
                >
                  {v.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Nội dung *</Label>
            <Textarea
              rows={5}
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              required
            />
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
