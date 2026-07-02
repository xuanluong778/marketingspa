'use client';

import { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SuggestCombobox, ServicesSuggestField } from '@/components/chatbot-cskh/suggest-combobox';
import { CHATBOT_INDUSTRY_OPTIONS, servicesForIndustry } from '@/config/chatbot-cskh-options';
import { TONE_OPTIONS, type ChatbotBot } from '@/types/chatbot-cskh';
import { useChatbotSuggest } from '@/hooks/use-chatbot-cskh';

interface BotFormPanelProps {
  form: Partial<ChatbotBot>;
  onChange: (patch: Partial<ChatbotBot>) => void;
  onSave: () => void;
  onCancel: () => void;
  onActivate?: () => void;
  saving?: boolean;
}

export function BotFormPanel({
  form,
  onChange,
  onSave,
  onCancel,
  onActivate,
  saving,
}: BotFormPanelProps) {
  const suggest = useChatbotSuggest();
  const [greetingHints, setGreetingHints] = useState<string[]>([]);

  const serviceOptions = servicesForIndustry(form.industry ?? undefined);

  async function handleSuggestGreeting() {
    const result = await suggest.mutateAsync({
      type: 'greeting',
      botName: form.botName,
      businessName: form.businessName ?? undefined,
      industry: form.industry ?? undefined,
      consultationTone: form.consultationTone,
      mainServices: form.mainServices ?? undefined,
    });
    onChange({ greeting: result.text });
    if (result.suggestions?.length) setGreetingHints(result.suggestions);
  }

  async function handleSuggestServices() {
    const result = await suggest.mutateAsync({
      type: 'services',
      industry: form.industry ?? undefined,
      mainServices: form.mainServices ?? undefined,
    });
    onChange({ mainServices: result.text });
  }

  return (
    <div className="rounded-lg border p-4 space-y-4 max-w-2xl">
      <h3 className="font-semibold">{form.id ? 'Chỉnh sửa chatbot' : 'Tạo chatbot mới'}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Tên chatbot *</Label>
          <Input
            value={form.botName ?? ''}
            onChange={(e) => onChange({ botName: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label>Tên doanh nghiệp</Label>
          <Input
            value={form.businessName ?? ''}
            onChange={(e) => onChange({ businessName: e.target.value })}
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>Ngành nghề</Label>
          <SuggestCombobox
            value={form.industry ?? ''}
            onChange={(v) => onChange({ industry: v })}
            options={CHATBOT_INDUSTRY_OPTIONS.map((o) => o.label)}
            placeholder="Chọn hoặc nhập ngành nghề..."
          />
        </div>
        <div className="space-y-1">
          <Label>Hotline</Label>
          <Input
            value={form.hotline ?? ''}
            onChange={(e) => onChange({ hotline: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label>Giọng điệu</Label>
          <Select
            value={form.consultationTone ?? 'friendly'}
            onValueChange={(v) => onChange({ consultationTone: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TONE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>Website</Label>
          <Input
            value={form.websiteUrl ?? ''}
            onChange={(e) => onChange({ websiteUrl: e.target.value })}
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <Label>Dịch vụ chính</Label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={suggest.isPending}
              onClick={() => void handleSuggestServices()}
            >
              {suggest.isPending ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3 mr-1" />
              )}
              Gợi ý dịch vụ
            </Button>
          </div>
          <ServicesSuggestField
            value={form.mainServices ?? ''}
            onChange={(v) => onChange({ mainServices: v })}
            options={serviceOptions}
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <Label>Lời chào</Label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={suggest.isPending}
              onClick={() => void handleSuggestGreeting()}
            >
              {suggest.isPending ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3 mr-1" />
              )}
              Gợi ý AI
            </Button>
          </div>
          <Textarea
            rows={3}
            value={form.greeting ?? ''}
            placeholder="Nhấn Gợi ý AI để tạo lời chào theo ngành & giọng điệu"
            onChange={(e) => onChange({ greeting: e.target.value })}
          />
          {greetingHints.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {greetingHints.map((g) => (
                <button
                  key={g}
                  type="button"
                  className="rounded-md border px-2 py-1 text-xs text-left hover:bg-accent max-w-full"
                  onClick={() => onChange({ greeting: g })}
                >
                  {g}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>Domain được phép (cách nhau bởi dấu phẩy)</Label>
          <Input
            placeholder="example.com, localhost"
            value={form.allowedDomains ?? ''}
            onChange={(e) => onChange({ allowedDomains: e.target.value })}
          />
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        {form.id && form.status !== 'ACTIVE' && onActivate && (
          <Button
            type="button"
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            disabled={saving || !form.botName}
            onClick={onActivate}
          >
            Kích hoạt chatbot
          </Button>
        )}
        {form.id && form.status === 'ACTIVE' && (
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => onChange({ status: 'PAUSED' })}
          >
            Tạm dừng
          </Button>
        )}
        <Button disabled={!form.botName || saving} onClick={onSave}>
          Lưu
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Hủy
        </Button>
      </div>
    </div>
  );
}
