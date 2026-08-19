'use client';

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { getApiBaseUrl } from '@/lib/api-client';
import type { FunnelCompleteSpec } from '@marketingspa/shared';

type PublicForm = {
  id: string;
  formId?: string;
  name: string;
  offer: string;
  cta: string;
  summary?: string;
  leadForm: FunnelCompleteSpec['leadForm'];
};

type Answers = Record<string, string | boolean | string[]>;

export default function PublicFunnelFormPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const id = params.id;
  const [form, setForm] = useState<PublicForm | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const api = useMemo(() => getApiBaseUrl(), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${api}/funnel-builder/public/${id}/form`);
        const body = (await res.json()) as PublicForm & { message?: string };
        if (!res.ok) throw new Error(body.message || 'Không tải được form');
        if (!cancelled) setForm(body);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Lỗi tải form');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, id]);

  function setField(field: { key: string; id?: string }, value: string | boolean | string[]) {
    setAnswers((prev) => {
      const next: Answers = { ...prev, [field.key]: value };
      if (field.id && field.id !== field.key) next[field.id] = value;
      return next;
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${api}/funnel-builder/public/${id}/lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers,
          formId: form.formId,
          landingPage: typeof window !== 'undefined' ? window.location.href : undefined,
          referrer: typeof document !== 'undefined' ? document.referrer : undefined,
          attribution: {
            utmSource: search.get('utm_source') || undefined,
            utmMedium: search.get('utm_medium') || undefined,
            utmCampaign: search.get('utm_campaign') || undefined,
            utmContent: search.get('utm_content') || undefined,
            utmTerm: search.get('utm_term') || undefined,
            fbclid: search.get('fbclid') || undefined,
            gclid: search.get('gclid') || undefined,
          },
        }),
      });
      const body = (await res.json()) as { message?: string; ok?: boolean };
      if (!res.ok) throw new Error(body.message || 'Không gửi được form');
      setDone(body.message || form.cta);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gửi form thất bại');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <Shell>Đang tải form…</Shell>;
  }
  if (error && !form) {
    return <Shell>{error}</Shell>;
  }
  if (!form) return null;

  if (done) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold text-[hsl(var(--heading))]">Đã nhận thông tin</h1>
        <p className="mt-3 text-lg">{done}</p>
        <p className="mt-2 text-sm text-white/70">
          Khách đã vào phễu “{form.name}”. Bạn có thể đóng trang này.
        </p>
      </Shell>
    );
  }

  const fields = form.leadForm?.fields ?? [];

  return (
    <Shell>
      <h1 className="text-2xl font-bold text-[hsl(var(--heading))]">{form.name}</h1>
      <p className="mt-1 text-white/80">{form.offer}</p>
      {form.leadForm?.title ? (
        <p className="mt-2 text-sm font-medium text-white/90">{form.leadForm.title}</p>
      ) : null}
      {form.summary ? <p className="mt-2 text-sm text-white/70">{form.summary}</p> : null}

      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        {fields.length === 0 ? (
          <p className="text-sm text-red-300">Form chưa có trường đăng ký. Hãy chỉnh sửa phễu rồi kích hoạt lại.</p>
        ) : null}
        {fields.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <Label htmlFor={field.key} className="text-white">
              {field.label}
              {field.required ? ' *' : ''}
            </Label>
            {field.type === 'textarea' ? (
              <Textarea
                id={field.key}
                required={field.required}
                placeholder={field.placeholder}
                value={String(answers[field.key] ?? '')}
                onChange={(e) => setField(field, e.target.value)}
              />
            ) : field.type === 'select' ? (
              <select
                id={field.key}
                required={field.required}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={String(answers[field.key] ?? '')}
                onChange={(e) => setField(field, e.target.value)}
              >
                <option value="">Chọn…</option>
                {(field.options ?? []).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : field.type === 'radio' ? (
              <div className="flex flex-wrap gap-3">
                {(field.options ?? []).map((o) => (
                  <label key={o} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={field.key}
                      value={o}
                      required={field.required}
                      checked={answers[field.key] === o}
                      onChange={() => setField(field, o)}
                    />
                    {o}
                  </label>
                ))}
              </div>
            ) : field.type === 'checkbox' ? (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={Boolean(answers[field.key])}
                  onCheckedChange={(v) => setField(field, v === true)}
                />
                {field.placeholder || 'Đồng ý'}
              </label>
            ) : (
              <Input
                id={field.key}
                type={
                  field.type === 'email' ? 'email' : field.type === 'tel' ? 'tel' : field.type === 'number' ? 'number' : 'text'
                }
                required={field.required}
                placeholder={field.placeholder}
                value={String(answers[field.key] ?? '')}
                onChange={(e) => setField(field, e.target.value)}
              />
            )}
          </div>
        ))}
        {form.leadForm?.privacyNote ? (
          <p className="text-xs text-white/60">{form.leadForm.privacyNote}</p>
        ) : null}
        {error && <p className="text-sm text-red-300">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Đang gửi…' : form.leadForm?.submitLabel || form.cta}
        </Button>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 py-10">
      <div className="rounded-xl border border-white/10 bg-card p-6 shadow-sm">{children}</div>
    </main>
  );
}
