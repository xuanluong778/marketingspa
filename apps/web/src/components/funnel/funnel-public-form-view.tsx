'use client';

import { useCallback, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  FUNNEL_CONTACT_CHANNEL_OPTIONS,
  FUNNEL_CONTACT_CHANNEL_OTHER,
  combineFunnelDatetimeLocal,
  normalizeFunnelContactChannelAnswer,
  parseFunnelDatetimeLocal,
} from '@marketingspa/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  FunnelInlineColorPicker,
  FunnelInlineEditable,
  FunnelSavedToast,
} from '@/components/funnel/funnel-inline-editable';
import { useFunnelInlineEditor } from '@/hooks/use-funnel-inline-edit';
import type { FunnelAppearance, FunnelCompleteSpec, FunnelDatetimeParts } from '@marketingspa/shared';

export type FunnelFormPayload = {
  id: string;
  formId?: string;
  name: string;
  offer: string;
  cta: string;
  summary?: string;
  leadForm: FunnelCompleteSpec['leadForm'];
  appearance?: FunnelAppearance | null;
  status?: string;
  canEdit?: boolean;
  editMode?: boolean;
  previewOnly?: boolean;
  liveFrozen?: boolean;
  hasUnpublishedChanges?: boolean;
};

type Answers = Record<string, string | boolean | string[]>;

type ContactChannelDraft = { preset: string; custom: string };

const selectFieldClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

export function FunnelPublicFormView({
  initial,
  apiBase,
}: {
  initial: FunnelFormPayload;
  apiBase: string;
}) {
  const search = useSearchParams();
  const [payload, setPayload] = useState(initial);
  const [answers, setAnswers] = useState<Answers>({});
  const [contactChannelDrafts, setContactChannelDrafts] = useState<
    Record<string, ContactChannelDraft>
  >({});
  const [datetimeDrafts, setDatetimeDrafts] = useState<Record<string, FunnelDatetimeParts>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const canEdit = Boolean(payload.canEdit && payload.editMode);
  const previewOnly = Boolean(payload.previewOnly);

  const editor = useFunnelInlineEditor(payload.id, {
    onSaved: (res) => {
      if (res.complete?.name) {
        setPayload((prev) => ({
          ...prev,
          name: res.complete.name,
          offer: res.complete.offer,
          cta: res.complete.cta,
          summary: res.complete.summary,
          leadForm: res.complete.leadForm,
          appearance: res.complete.appearance ?? null,
          hasUnpublishedChanges: res.hasUnpublishedChanges,
        }));
      } else {
        setPayload((prev) => ({
          ...prev,
          hasUnpublishedChanges: res.hasUnpublishedChanges ?? false,
        }));
      }
    },
  });

  const appearance = payload.appearance ?? {};
  const shellStyle = useMemo(
    () => ({
      ...(appearance.backgroundColor ? { backgroundColor: appearance.backgroundColor } : {}),
    }),
    [appearance.backgroundColor],
  );
  const headingStyle: CSSProperties | undefined = appearance.headingColor
    ? { color: appearance.headingColor }
    : undefined;
  const ctaStyle: CSSProperties = {
    ...(appearance.ctaBackgroundColor ? { backgroundColor: appearance.ctaBackgroundColor } : {}),
    ...(appearance.ctaTextColor ? { color: appearance.ctaTextColor } : {}),
  };

  const patchAndSave = useCallback(
    (patch: Record<string, unknown>) => {
      if (!canEdit) return;
      void editor.savePatch(patch as Parameters<typeof editor.savePatch>[0]);
    },
    [canEdit, editor],
  );

  function setField(field: { key: string; id?: string }, value: string | boolean | string[]) {
    setAnswers((prev) => {
      const next: Answers = { ...prev, [field.key]: value };
      if (field.id && field.id !== field.key) next[field.id] = value;
      return next;
    });
  }

  function setContactChannelDraft(
    field: { key: string; id?: string },
    patch: Partial<ContactChannelDraft>,
  ) {
    setContactChannelDrafts((prev) => {
      const current = prev[field.key] ?? { preset: '', custom: '' };
      const nextDraft = { ...current, ...patch };
      const normalized = normalizeFunnelContactChannelAnswer(nextDraft.preset, nextDraft.custom);
      setAnswers((prevAnswers) => {
        const next: Answers = { ...prevAnswers, [field.key]: normalized };
        if (field.id && field.id !== field.key) next[field.id] = normalized;
        return next;
      });
      return { ...prev, [field.key]: nextDraft };
    });
  }

  function buildSubmitAnswers(): Answers {
    const out: Answers = { ...answers };
    for (const field of payload.leadForm?.fields ?? []) {
      if (field.type === 'contact_channel') {
        const draft = contactChannelDrafts[field.key] ?? { preset: '', custom: '' };
        const normalized = normalizeFunnelContactChannelAnswer(draft.preset, draft.custom);
        out[field.key] = normalized;
        if (field.id && field.id !== field.key) out[field.id] = normalized;
      }
      if (field.type === 'datetime' || field.key === 'preferred_time') {
        const draft =
          datetimeDrafts[field.key] ??
          parseFunnelDatetimeLocal(String(answers[field.key] ?? ''));
        const combined = combineFunnelDatetimeLocal(draft.date, draft.time);
        if (combined) {
          out[field.key] = combined;
          if (field.id && field.id !== field.key) out[field.id] = combined;
        }
      }
    }
    return out;
  }

  function formatSubmitError(body: {
    message?: string;
    issues?: string[];
    errors?: string[];
  }): string {
    const issues = body.issues ?? body.errors;
    if (issues?.length) return issues.join(' · ');
    return body.message || 'Không gửi được form';
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (previewOnly || canEdit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/funnel-builder/public/${payload.id}/lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: buildSubmitAnswers(),
          formId: payload.formId,
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
      const body = (await res.json()) as {
        message?: string;
        issues?: string[];
        errors?: string[];
      };
      if (!res.ok) throw new Error(formatSubmitError(body));
      setDone(body.message || payload.cta);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gửi form thất bại');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <FunnelShell style={shellStyle}>
        <h1 className="text-2xl font-bold" style={headingStyle}>
          Đã nhận thông tin
        </h1>
        <p className="mt-3 text-lg">{done}</p>
      </FunnelShell>
    );
  }

  const fields = payload.leadForm?.fields ?? [];

  return (
    <>
      <FunnelShell style={shellStyle}>
        {canEdit ? (
          <div className="mb-4 space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
            <p className="font-medium text-amber-100">Chế độ chỉnh sửa trực tiếp</p>
            {payload.liveFrozen ? (
              <p className="text-xs text-white/75">
                Thay đổi lưu vào bản nháp. Khách live vẫn thấy phiên bản cũ cho đến khi bạn cập nhật.
              </p>
            ) : (
              <p className="text-xs text-white/75">Xem trước — chưa gửi lead thật.</p>
            )}
            {payload.hasUnpublishedChanges ? (
              <Button
                type="button"
                size="sm"
                className="mt-1"
                disabled={editor.publishing}
                onClick={() => void editor.publishLiveUpdate()}
              >
                {editor.publishing ? 'Đang cập nhật…' : 'Cập nhật phiên bản đang chạy'}
              </Button>
            ) : null}
          </div>
        ) : null}

        <h1 className="text-2xl font-bold" style={headingStyle}>
          <FunnelInlineEditable
            canEdit={canEdit}
            value={payload.name}
            onCommit={(name) => patchAndSave({ name })}
          />
        </h1>

        <p className="mt-1 text-white/80">
          <FunnelInlineEditable
            canEdit={canEdit}
            value={payload.offer}
            onCommit={(offer) => patchAndSave({ offer })}
          />
        </p>

        <p className="mt-2 text-sm font-medium text-white/90">
          <FunnelInlineEditable
            canEdit={canEdit}
            value={payload.leadForm?.title || ''}
            placeholder="Tiêu đề form"
            onCommit={(title) => patchAndSave({ leadForm: { title } })}
          />
        </p>

        {(payload.summary || canEdit) && (
          <p className="mt-2 text-sm text-white/70">
            <FunnelInlineEditable
              canEdit={canEdit}
              multiline
              value={payload.summary || ''}
              placeholder="Mô tả phễu…"
              onCommit={(summary) => patchAndSave({ summary })}
            />
          </p>
        )}

        {canEdit ? (
          <div className="mt-4 flex flex-wrap gap-3 rounded-md border border-white/10 p-3">
            <FunnelInlineColorPicker
              label="Màu nền"
              value={appearance.backgroundColor}
              canEdit
              onCommit={(backgroundColor) => patchAndSave({ appearance: { backgroundColor } })}
            />
            <FunnelInlineColorPicker
              label="Tiêu đề"
              value={appearance.headingColor}
              canEdit
              onCommit={(headingColor) => patchAndSave({ appearance: { headingColor } })}
            />
            <FunnelInlineColorPicker
              label="Nút CTA"
              value={appearance.ctaBackgroundColor}
              canEdit
              onCommit={(ctaBackgroundColor) =>
                patchAndSave({ appearance: { ctaBackgroundColor } })
              }
            />
          </div>
        ) : null}

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          {fields.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={field.key} className="text-white">
                <FunnelInlineEditable
                  canEdit={canEdit}
                  value={field.label}
                  onCommit={(label) =>
                    patchAndSave({ leadForm: { fields: [{ key: field.key, label }] } })
                  }
                />
                {field.required ? ' *' : ''}
              </Label>
              {canEdit ? (
                <p className="text-xs text-white/50">
                  Placeholder:{' '}
                  <FunnelInlineEditable
                    canEdit
                    value={field.placeholder || ''}
                    placeholder="Thêm placeholder…"
                    onCommit={(placeholder) =>
                      patchAndSave({ leadForm: { fields: [{ key: field.key, placeholder }] } })
                    }
                  />
                </p>
              ) : null}
              {field.type === 'textarea' ? (
                <Textarea
                  id={field.key}
                  required={field.required && !canEdit}
                  disabled={canEdit}
                  placeholder={field.placeholder}
                  value={String(answers[field.key] ?? '')}
                  onChange={(e) => setField(field, e.target.value)}
                />
              ) : field.type === 'checkbox' ? (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    disabled={canEdit}
                    checked={Boolean(answers[field.key])}
                    onCheckedChange={(v) => setField(field, v === true)}
                  />
                  {field.placeholder || 'Đồng ý'}
                </label>
              ) : field.type === 'datetime' || field.key === 'preferred_time' ? (
                <PreferredDatetimeField
                  field={field}
                  canEdit={canEdit}
                  draft={
                    datetimeDrafts[field.key] ??
                    parseFunnelDatetimeLocal(String(answers[field.key] ?? ''))
                  }
                  onDraftChange={(patch) =>
                    setDatetimeDrafts((prev) => ({
                      ...prev,
                      [field.key]: {
                        ...(prev[field.key] ??
                          parseFunnelDatetimeLocal(String(answers[field.key] ?? ''))),
                        ...patch,
                      },
                    }))
                  }
                  onChange={(value) => setField(field, value)}
                />
              ) : field.type === 'contact_channel' ? (
                <ContactChannelField
                  field={field}
                  canEdit={canEdit}
                  draft={contactChannelDrafts[field.key] ?? { preset: '', custom: '' }}
                  options={
                    field.options?.length ? field.options : [...FUNNEL_CONTACT_CHANNEL_OPTIONS]
                  }
                  onDraftChange={(patch) => setContactChannelDraft(field, patch)}
                />
              ) : field.type === 'select' ? (
                <select
                  id={field.key}
                  disabled={canEdit}
                  required={field.required && !canEdit}
                  className={selectFieldClass}
                  value={String(answers[field.key] ?? '')}
                  onChange={(e) => setField(field, e.target.value)}
                >
                  <option value="">{field.placeholder || 'Chọn…'}</option>
                  {(field.options ?? []).map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : field.type === 'radio' ? (
                <div className="flex flex-col gap-2">
                  {(field.options ?? []).map((opt) => (
                    <label key={opt} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name={field.key}
                        disabled={canEdit}
                        required={field.required && !canEdit && !answers[field.key]}
                        checked={answers[field.key] === opt}
                        onChange={() => setField(field, opt)}
                        className="h-4 w-4 accent-primary"
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              ) : (
                <Input
                  id={field.key}
                  disabled={canEdit}
                  type={
                    field.type === 'email'
                      ? 'email'
                      : field.type === 'tel'
                        ? 'tel'
                        : field.type === 'number'
                          ? 'number'
                          : 'text'
                  }
                  required={field.required && !canEdit}
                  placeholder={field.placeholder}
                  value={String(answers[field.key] ?? '')}
                  onChange={(e) => setField(field, e.target.value)}
                />
              )}
            </div>
          ))}

          {(payload.leadForm?.privacyNote || canEdit) && (
            <p className="text-xs text-white/60">
              <FunnelInlineEditable
                canEdit={canEdit}
                multiline
                value={payload.leadForm?.privacyNote || ''}
                placeholder="Ghi chú quyền riêng tư…"
                onCommit={(privacyNote) => patchAndSave({ leadForm: { privacyNote } })}
              />
            </p>
          )}

          {error ? <p className="text-sm text-red-300">{error}</p> : null}

          {canEdit ? (
            <Button type="button" disabled style={ctaStyle}>
              <FunnelInlineEditable
                canEdit
                value={payload.leadForm?.submitLabel || payload.cta}
                onCommit={(submitLabel) => patchAndSave({ leadForm: { submitLabel } })}
              />
            </Button>
          ) : (
            <Button type="submit" disabled={submitting || previewOnly} style={ctaStyle}>
              {submitting
                ? 'Đang gửi…'
                : previewOnly
                  ? 'Xem trước (chưa gửi)'
                  : payload.leadForm?.submitLabel || payload.cta}
            </Button>
          )}
        </form>
      </FunnelShell>
      <FunnelSavedToast show={editor.savedFlash} />
    </>
  );
}

const datetimeInputClass =
  'min-h-10 cursor-pointer [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-calendar-picker-indicator]:invert';

function PreferredDatetimeField({
  field,
  canEdit,
  draft,
  onDraftChange,
  onChange,
}: {
  field: { key: string; required?: boolean; placeholder?: string };
  canEdit: boolean;
  draft: FunnelDatetimeParts;
  onDraftChange: (patch: Partial<FunnelDatetimeParts>) => void;
  onChange: (value: string) => void;
}) {
  function updateDate(next: string) {
    onDraftChange({ date: next });
    onChange(combineFunnelDatetimeLocal(next, draft.time));
  }

  function updateTime(next: string) {
    onDraftChange({ time: next });
    onChange(combineFunnelDatetimeLocal(draft.date, next));
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1">
        <span className="text-xs text-white/60">Ngày</span>
        <Input
          id={`${field.key}_date`}
          disabled={canEdit}
          type="date"
          required={field.required && !canEdit}
          className={datetimeInputClass}
          value={draft.date}
          onChange={(e) => updateDate(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <span className="text-xs text-white/60">Giờ</span>
        <Input
          id={`${field.key}_time`}
          disabled={canEdit}
          type="time"
          required={field.required && !canEdit}
          className={datetimeInputClass}
          value={draft.time}
          onChange={(e) => updateTime(e.target.value)}
        />
      </div>
    </div>
  );
}

function ContactChannelField({
  field,
  canEdit,
  draft,
  options,
  onDraftChange,
}: {
  field: { key: string; required?: boolean; placeholder?: string };
  canEdit: boolean;
  draft: ContactChannelDraft;
  options: string[];
  onDraftChange: (patch: Partial<ContactChannelDraft>) => void;
}) {
  const showCustom = draft.preset === FUNNEL_CONTACT_CHANNEL_OTHER;
  return (
    <div className="space-y-2">
      <select
        id={field.key}
        disabled={canEdit}
        required={field.required && !canEdit && !draft.preset}
        className={selectFieldClass}
        value={draft.preset}
        onChange={(e) => onDraftChange({ preset: e.target.value })}
      >
        <option value="">{field.placeholder || 'Chọn kênh liên hệ…'}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      {showCustom ? (
        <Input
          id={`${field.key}_custom`}
          disabled={canEdit}
          required={field.required && !canEdit}
          placeholder="Nhập kênh liên hệ (vd: Telegram, Viber…)"
          value={draft.custom}
          onChange={(e) => onDraftChange({ custom: e.target.value })}
        />
      ) : null}
    </div>
  );
}

function FunnelShell({ children, style }: { children: React.ReactNode; style?: CSSProperties }) {
  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 py-6 sm:py-10">
      <div
        className="rounded-xl border border-white/10 bg-card p-4 shadow-sm sm:p-6"
        style={style}
      >
        {children}
      </div>
    </main>
  );
}
