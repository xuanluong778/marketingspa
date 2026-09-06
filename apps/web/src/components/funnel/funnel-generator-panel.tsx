'use client';

import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useGenerateFunnelComplete,
  useGenerateFunnelRecommendations,
  useSelectFunnelRecommendation,
} from '@/hooks/use-funnel-builder';
import { FunnelCapturePanel } from '@/components/funnel/funnel-capture-panel';
import type {
  FunnelCompleteSpec,
  FunnelGeneratorResult,
  FunnelRecommendationOption,
} from '@/types/funnel';
import { funnelHref } from '@/lib/funnel-tabs';
import { cn } from '@/lib/utils';

const GOAL_OPTIONS = [
  'Thu lead mới',
  'Đặt lịch tư vấn / booking',
  'Bán voucher / gói ưu đãi',
  'Flash sale / khuyến mãi',
  'Reactivation khách cũ',
  'Referral / giới thiệu bạn',
  'Tăng nhận diện thương hiệu',
];

const CHANNEL_OPTIONS = [
  'Facebook Ads',
  'TikTok Ads',
  'Google Ads',
  'Zalo OA',
  'Messenger',
  'Instagram',
  'SEO / Content',
  'Offline / cửa hàng',
];

type FormState = {
  productService: string;
  goal: string;
  price: string;
  budget: string;
  region: string;
  audience: string;
  channels: string[];
  notes: string;
  prompt: string;
};

const EMPTY_FORM: FormState = {
  productService: '',
  goal: '',
  price: '',
  budget: '',
  region: '',
  audience: '',
  channels: [],
  notes: '',
  prompt: '',
};

export function FunnelGeneratorPanel({ autoFocusForm = false }: { autoFocusForm?: boolean }) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(autoFocusForm);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [result, setResult] = useState<FunnelGeneratorResult | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [complete, setComplete] = useState<FunnelCompleteSpec | null>(null);
  const [completeSource, setCompleteSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const generate = useGenerateFunnelRecommendations();
  const select = useSelectFunnelRecommendation();
  const generateComplete = useGenerateFunnelComplete();

  const canSubmit = useMemo(() => {
    return (
      form.productService.trim().length >= 2 &&
      form.goal.trim().length >= 2 &&
      form.prompt.trim().length >= 8
    );
  }, [form.productService, form.goal, form.prompt]);

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleChannel(channel: string) {
    setForm((prev) => {
      const has = prev.channels.includes(channel);
      return {
        ...prev,
        channels: has ? prev.channels.filter((c) => c !== channel) : [...prev.channels, channel],
      };
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setInfo(null);
    setSelectedSlug(null);
    setComplete(null);
    setCompleteSource(null);
    try {
      const res = await generate.mutateAsync({
        prompt: form.prompt.trim(),
        productService: form.productService.trim() || undefined,
        goal: form.goal.trim() || undefined,
        price: form.price.trim() || undefined,
        budget: form.budget.trim() || undefined,
        region: form.region.trim() || undefined,
        audience: form.audience.trim() || undefined,
        channels: form.channels.length ? form.channels : undefined,
        notes: form.notes.trim() || undefined,
      });
      setResult(res);
      setInfo('AI đã đề xuất các phễu. Chọn 1 card để tiếp tục (chưa apply/deploy).');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tạo được đề xuất');
    }
  }

  async function onSelect(option: FunnelRecommendationOption) {
    if (!result?.id) return;
    setError(null);
    setComplete(null);
    setCompleteSource(null);
    try {
      await select.mutateAsync({
        id: result.id,
        templateSlug: option.templateSlug,
      });
      setSelectedSlug(option.templateSlug);
      setInfo(`Đã chọn “${option.funnelName}”. Có thể tạo Funnel JSON hoàn chỉnh (draft).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không chọn được phương án');
    }
  }

  async function onGenerateComplete() {
    if (!result?.id || !selectedSlug) return;
    setError(null);
    try {
      const res = await generateComplete.mutateAsync(result.id);
      setComplete(res.complete);
      setCompleteSource(res.source);
      setInfo(`Đã tạo Funnel hoàn chỉnh (${res.complete.schemaVersion}). Draft — chưa apply.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tạo được Funnel hoàn chỉnh');
    }
  }

  return (
    <div className="space-y-6">
      {!formOpen && !result && (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 py-8 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Tạo phễu bằng AI</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Điền brief marketing — AI đề xuất 3–5 funnel từ template catalog để bạn chọn.
              </p>
            </div>
            <Button size="lg" onClick={() => setFormOpen(true)}>
              Tạo phễu bằng AI
            </Button>
          </CardContent>
        </Card>
      )}

      {formOpen && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Brief tạo phễu bằng AI</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={onSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <Label htmlFor="ai-product">
                    Sản phẩm / dịch vụ <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="ai-product"
                    value={form.productService}
                    onChange={(e) => patch('productService', e.target.value)}
                    placeholder="VD: Phun môi collagen, massage đá nóng…"
                    required
                  />
                </Field>
                <Field>
                  <Label>
                    Mục tiêu <span className="text-destructive">*</span>
                  </Label>
                  <Select value={form.goal || undefined} onValueChange={(v) => patch('goal', v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn mục tiêu phễu" />
                    </SelectTrigger>
                    <SelectContent>
                      {GOAL_OPTIONS.map((g) => (
                        <SelectItem key={g} value={g}>
                          {g}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <Label htmlFor="ai-price">Giá bán</Label>
                  <Input
                    id="ai-price"
                    value={form.price}
                    onChange={(e) => patch('price', e.target.value)}
                    placeholder="VD: 1.990.000đ / liệu trình"
                  />
                </Field>
                <Field>
                  <Label htmlFor="ai-budget">Ngân sách</Label>
                  <Input
                    id="ai-budget"
                    value={form.budget}
                    onChange={(e) => patch('budget', e.target.value)}
                    placeholder="VD: 15–20 triệu / tháng ads"
                  />
                </Field>
                <Field>
                  <Label htmlFor="ai-region">Khu vực</Label>
                  <Input
                    id="ai-region"
                    value={form.region}
                    onChange={(e) => patch('region', e.target.value)}
                    placeholder="VD: Quận 1, TP.HCM"
                  />
                </Field>
                <Field>
                  <Label htmlFor="ai-audience">Đối tượng</Label>
                  <Input
                    id="ai-audience"
                    value={form.audience}
                    onChange={(e) => patch('audience', e.target.value)}
                    placeholder="VD: Nữ 25–40, văn phòng, quan tâm thẩm mỹ"
                  />
                </Field>
              </div>

              <Field>
                <Label>Kênh marketing</Label>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {CHANNEL_OPTIONS.map((ch) => {
                    const checked = form.channels.includes(ch);
                    return (
                      <label
                        key={ch}
                        className={cn(
                          'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm',
                          checked && 'border-primary bg-primary/5',
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleChannel(ch)}
                        />
                        {ch}
                      </label>
                    );
                  })}
                </div>
              </Field>

              <Field>
                <Label htmlFor="ai-notes">Mô tả thêm</Label>
                <Textarea
                  id="ai-notes"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => patch('notes', e.target.value)}
                  placeholder="Ưu đãi hiện có, USP, hạn chế vận hành…"
                />
              </Field>

              <Field>
                <Label htmlFor="ai-how">
                  Bạn muốn AI tạo phễu như thế nào? <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="ai-how"
                  rows={4}
                  value={form.prompt}
                  onChange={(e) => patch('prompt', e.target.value)}
                  placeholder="VD: Thu lead phun môi bằng voucher 199k, chatbot hỏi nhu cầu rồi chuyển sale book lịch trong 15 phút…"
                  required
                />
              </Field>

              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" disabled={!canSubmit || generate.isPending}>
                  {generate.isPending ? 'AI đang đề xuất…' : 'AI đề xuất Funnel'}
                </Button>
                {result && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setResult(null);
                      setSelectedSlug(null);
                      setComplete(null);
                      setInfo(null);
                    }}
                  >
                    Tạo brief mới
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Kết quả là đề xuất từ Funnel Template Engine — chưa apply pipeline live.
              </p>
              {error && <p className="text-sm text-destructive">{error}</p>}
              {info && <p className="text-sm text-green-700">{info}</p>}
            </form>
          </CardContent>
        </Card>
      )}

      {result && (
        <>
          <div>
            <h3 className="mb-3 text-base font-semibold tracking-tight">
              Funnel AI đề xuất
              <Badge className="ml-2" variant="outline">
                {result.recommendations.length} phương án
              </Badge>
              <Badge className="ml-2" variant="secondary">
                {result.source ?? 'ai'}
              </Badge>
            </h3>
            <div className="grid gap-4 lg:grid-cols-2">
              {result.recommendations.map((opt) => (
                <RecommendationCard
                  key={opt.templateSlug}
                  option={opt}
                  selected={selectedSlug === opt.templateSlug}
                  selecting={select.isPending}
                  onSelect={() => onSelect(opt)}
                  onViewTemplate={() =>
                    router.push(
                      funnelHref({
                        tab: 'create',
                        source: 'templates',
                        focus: opt.templateSlug,
                      }),
                    )
                  }
                />
              ))}
            </div>
          </div>

          {result.analysis && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tóm tắt phân tích brief</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
                <Meta label="Dịch vụ" value={result.analysis.service} />
                <Meta label="Mục tiêu" value={result.analysis.goal} />
                <Meta label="Đối tượng" value={result.analysis.targetAudience} />
                <Meta label="Offer" value={result.analysis.offer} />
                <div className="sm:col-span-2 flex flex-wrap gap-1">
                  {result.analysis.channels.map((c) => (
                    <Badge key={c} variant="outline">
                      {c}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {selectedSlug && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Bước tiếp theo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Đã chọn <Badge variant="outline">{selectedSlug}</Badge>. Tạo JSON Funnel đầy đủ
                  (draft) hoặc sang Templates để clone/apply.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={onGenerateComplete}
                    disabled={!result.id || generateComplete.isPending}
                  >
                    {generateComplete.isPending ? 'Đang tạo…' : 'Tạo Funnel hoàn chỉnh'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      router.push(
                        funnelHref({
                          tab: 'create',
                          source: 'templates',
                          focus: selectedSlug,
                        }),
                      )
                    }
                  >
                    Xem template
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {complete && result.id && (
            <>
              <CompleteFunnelPreview
                spec={complete}
                source={completeSource}
                recommendationId={result.id}
              />
              <FunnelCapturePanel recommendationId={result.id} spec={complete} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function RecommendationCard({
  option,
  selected,
  selecting,
  onSelect,
  onViewTemplate,
}: {
  option: FunnelRecommendationOption;
  selected: boolean;
  selecting: boolean;
  onSelect: () => void;
  onViewTemplate: () => void;
}) {
  return (
    <Card
      className={cn(
        'transition-shadow',
        selected && 'border-primary shadow-md ring-1 ring-primary',
      )}
    >
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-snug">{option.funnelName}</CardTitle>
          <Badge>{option.fitScore}/100</Badge>
        </div>
        <Badge variant="outline">{option.templateSlug}</Badge>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <Block title="Chiến lược" body={option.strategy} />
        <Block title="Lý do phù hợp" body={option.fitReason} />
        <Block title="Offer" body={option.offer} />
        <div>
          <div className="text-xs font-medium text-muted-foreground">Customer journey</div>
          <ol className="mt-1 list-decimal space-y-1 pl-5">
            {option.customerJourney.map((j) => (
              <li key={`${option.templateSlug}-${j.step}`}>
                {j.label}
                {j.description ? ` — ${j.description}` : ''}
              </li>
            ))}
          </ol>
        </div>
        <div className="flex flex-wrap gap-1">
          {option.channels.map((c) => (
            <Badge key={c} variant="secondary">
              {c}
            </Badge>
          ))}
        </div>
        <div className="rounded-md bg-muted/50 px-3 py-2 font-medium">CTA: {option.cta}</div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" onClick={onSelect} disabled={selecting}>
            {selected ? 'Đã chọn' : 'Chọn phễu này'}
          </Button>
          <Button size="sm" variant="outline" onClick={onViewTemplate}>
            Xem template
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CompleteFunnelPreview({
  spec,
  source,
  recommendationId,
}: {
  spec: FunnelCompleteSpec;
  source: string | null;
  recommendationId: string;
}) {
  const router = useRouter();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Funnel draft
          <Badge className="ml-2" variant="outline">
            {spec.schemaVersion}
          </Badge>
          <Badge className="ml-2" variant="secondary">
            {source ?? 'ai'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <Meta label="Tên" value={spec.name} />
          <Meta label="Template" value={spec.templateSlug} />
          <Meta label="Offer" value={spec.offer} />
          <Meta label="CTA" value={spec.cta} />
        </div>
        <Block title="Chiến lược" body={spec.strategy} />
        <Section title={`Nodes (${spec.nodes.length})`}>
          <ul className="list-disc pl-5">
            {spec.nodes.map((n) => (
              <li key={n.id}>
                {n.label} <Badge variant="outline">{n.type}</Badge>
              </li>
            ))}
          </ul>
        </Section>
        <Section title="KPI">
          <ul className="list-disc pl-5">
            {spec.kpis.map((k) => (
              <li key={k.key}>
                {k.label}: {k.target} {k.unit}
              </li>
            ))}
          </ul>
        </Section>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() =>
              router.push(funnelHref({ tab: 'mine', design: recommendationId }))
            }
          >
            Mở thiết kế phễu
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              router.push(
                funnelHref({
                  tab: 'create',
                  source: 'templates',
                  focus: spec.templateSlug,
                }),
              )
            }
          >
            Chọn mẫu để clone/áp dụng
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ children }: { children: ReactNode }) {
  return <div className="space-y-1.5">{children}</div>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function Block({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground">{title}</div>
      <p className="mt-0.5">{body}</p>
    </div>
  );
}
