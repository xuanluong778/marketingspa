'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingState, ErrorState } from '@/components/shared/page-state';
import { apiClient } from '@/lib/api-client';
import { useT } from '@/i18n/i18n-provider';

type Policy = {
  timezone: string;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  maxMessagesPerRecipientPerDay: number;
  campaignCooldownMinutes: number;
  stopOnReply: boolean;
  stopOnOptOut: boolean;
  createTaskOnReply: boolean;
  assignEmployeeOnReply: boolean;
  handoverToChatbotOnReply: boolean;
  excludeRecentlyManualMessaged: boolean;
  manualMessageLookbackMinutes: number;
  optOutKeywords: string[] | unknown;
};

export function MessagingPolicyPanel() {
  const t = useT();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['automation', 'messaging-policy'],
    queryFn: () => apiClient<Policy>('/automation/messaging-policy'),
  });
  const save = useMutation({
    mutationFn: (body: Partial<Policy>) =>
      apiClient<Policy>('/automation/messaging-policy', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation', 'messaging-policy'] }),
  });

  const [form, setForm] = useState<Partial<Policy>>({});
  const [keywords, setKeywords] = useState('STOP,HUY,UNSUB');

  useEffect(() => {
    if (!q.data) return;
    setForm(q.data);
    const kw = Array.isArray(q.data.optOutKeywords)
      ? (q.data.optOutKeywords as string[]).join(',')
      : 'STOP,HUY,UNSUB';
    setKeywords(kw);
  }, [q.data]);

  if (q.isLoading) return <LoadingState message={t('automation.loadingPolicy')} />;
  if (q.isError) return <ErrorState onRetry={q.refetch} />;

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div>
        <h3 className="font-semibold">{t('automation.antiSpam')}</h3>
        <p className="text-sm text-muted-foreground">
          Quiet hours, giới hạn gửi/ngày, dừng khi trả lời / opt-out
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Timezone</Label>
          <Input
            value={form.timezone ?? 'Asia/Ho_Chi_Minh'}
            onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <Label>Tối đa tin / người / ngày</Label>
          <Input
            type="number"
            value={form.maxMessagesPerRecipientPerDay ?? 3}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                maxMessagesPerRecipientPerDay: Number(e.target.value) || 1,
              }))
            }
          />
        </div>
        <div className="space-y-1">
          <Label>Quiet hours bắt đầu</Label>
          <Input
            placeholder="22:00"
            value={form.quietHoursStart ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, quietHoursStart: e.target.value || null }))}
          />
        </div>
        <div className="space-y-1">
          <Label>Quiet hours kết thúc</Label>
          <Input
            placeholder="08:00"
            value={form.quietHoursEnd ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, quietHoursEnd: e.target.value || null }))}
          />
        </div>
        <div className="space-y-1">
          <Label>Cooldown giữa chiến dịch (phút)</Label>
          <Input
            type="number"
            value={form.campaignCooldownMinutes ?? 1440}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                campaignCooldownMinutes: Number(e.target.value) || 0,
              }))
            }
          />
        </div>
        <div className="space-y-1">
          <Label>Từ khóa opt-out (phẩy)</Label>
          <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} />
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 text-sm">
        {(
          [
            ['stopOnReply', 'Dừng khi khách trả lời'],
            ['stopOnOptOut', 'Dừng khi opt-out'],
            ['createTaskOnReply', 'Tạo task khi trả lời'],
            ['assignEmployeeOnReply', 'Gán nhân viên khi trả lời'],
            ['handoverToChatbotOnReply', 'Chuyển chatbot khi trả lời'],
            ['excludeRecentlyManualMessaged', 'Loại khách vừa nhắn tay'],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!form[key]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
            />
            {label}
          </label>
        ))}
      </div>
      <Button
        onClick={() =>
          save.mutate(
            {
              ...form,
              optOutKeywords: keywords
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
            },
            {
              onSuccess: () => window.alert(t('automation.policySaved')),
              onError: (e) => window.alert(e.message),
            },
          )
        }
        disabled={save.isPending}
      >
        {save.isPending ? t('automation.saving') : t('automation.savePolicy')}
      </Button>
    </div>
  );
}

export default MessagingPolicyPanel;
