import type { FunnelCompleteSpec } from './funnel-complete';
import { funnelLeadFormFieldSchema } from './funnel-complete';

export type FunnelFormAnswerValue = string | boolean | string[] | number | null;

export type FunnelFormAnswers = Record<string, FunnelFormAnswerValue>;

export type FunnelLeadMapped = {
  name: string;
  phone?: string;
  email?: string;
  note?: string;
  extra: Array<{ key: string; label: string; value: string }>;
};

const NAME_KEYS = new Set(['full_name', 'name', 'ho_ten', 'hoten', 'fullname', 'ho_va_ten']);
const PHONE_KEYS = new Set(['phone', 'sdt', 'tel', 'mobile', 'dien_thoai', 'so_dien_thoai']);
const EMAIL_KEYS = new Set(['email', 'mail', 'e_mail']);
const PLACEHOLDER_NAME = /^(khách funnel|khach funnel)$/i;

type LeadFormField = FunnelCompleteSpec['leadForm']['fields'][number];

export function stringifyFunnelAnswer(value: FunnelFormAnswerValue): string {
  if (value == null) return '';
  if (typeof value === 'boolean') return value ? 'có' : 'không';
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean).join(', ');
  return String(value).trim();
}

/** Resolve a submitted value by field.key or field.id (public form may send either). */
export function readFunnelFormAnswer(
  field: Pick<LeadFormField, 'key'> & { id?: string },
  answers: FunnelFormAnswers,
): FunnelFormAnswerValue | undefined {
  const keys = [field.key, field.id, field.key.toLowerCase(), field.id?.toLowerCase()].filter(
    (k): k is string => !!k,
  );
  for (const k of keys) {
    if (!Object.prototype.hasOwnProperty.call(answers, k)) continue;
    const raw = answers[k];
    if (raw === undefined || raw === null || raw === '') continue;
    return raw;
  }
  return undefined;
}

function fieldTokens(field: LeadFormField): string {
  return `${field.key} ${field.id ?? ''} ${field.label}`.toLowerCase();
}

function isNameField(field: LeadFormField): boolean {
  const key = field.key.toLowerCase();
  const id = field.id?.toLowerCase() ?? '';
  if (NAME_KEYS.has(key) || NAME_KEYS.has(id)) return true;
  return field.type === 'text' && /(họ\s*(và)?\s*tên|ho_?va_?ten|full_?name|(^|_)name($|_))/i.test(fieldTokens(field));
}

function isPhoneField(field: LeadFormField): boolean {
  const key = field.key.toLowerCase();
  const id = field.id?.toLowerCase() ?? '';
  if (PHONE_KEYS.has(key) || PHONE_KEYS.has(id) || field.type === 'tel') return true;
  return /(sđt|so_?dien_?thoai|điện thoại|dien thoai|(^|_)phone($|_))/i.test(fieldTokens(field));
}

function isEmailField(field: LeadFormField): boolean {
  const key = field.key.toLowerCase();
  const id = field.id?.toLowerCase() ?? '';
  if (EMAIL_KEYS.has(key) || EMAIL_KEYS.has(id) || field.type === 'email') return true;
  return /(e-?mail|thư điện tử)/i.test(fieldTokens(field));
}

export function isFunnelPlaceholderLeadName(name?: string | null): boolean {
  return !name || PLACEHOLDER_NAME.test(name.trim());
}

export function validateFunnelFormAnswers(
  spec: FunnelCompleteSpec,
  answers: FunnelFormAnswers,
): { ok: true } | { ok: false; issues: string[] } {
  const issues: string[] = [];
  const fields = spec.leadForm?.fields ?? [];
  if (fields.length < 1) issues.push('Funnel chưa có lead form');

  for (const field of fields) {
    const parsed = funnelLeadFormFieldSchema.safeParse(field);
    if (!parsed.success) {
      issues.push(`Field không hợp lệ: ${field.key}`);
      continue;
    }
    const raw = readFunnelFormAnswer(field, answers);
    const text = stringifyFunnelAnswer(raw ?? null);
    if (field.required) {
      if (field.type === 'checkbox' && raw !== true && raw !== 'true' && raw !== 'có') {
        issues.push(`Cần chọn ${field.label}`);
        continue;
      }
      if (field.type !== 'checkbox' && !text) {
        issues.push(`Thiếu ${field.label}`);
        continue;
      }
    }
    if (!text) continue;
    if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
      issues.push(`${field.label} không đúng định dạng email`);
    }
    if ((field.type === 'tel' || isPhoneField(field)) && text.replace(/\D/g, '').length < 8) {
      issues.push(`${field.label} không hợp lệ`);
    }
    if (
      (field.type === 'select' || field.type === 'radio') &&
      field.options?.length &&
      !field.options.includes(text)
    ) {
      issues.push(`${field.label}: giá trị không nằm trong lựa chọn`);
    }
    if (field.type === 'checkbox' && Array.isArray(raw) && field.options?.length) {
      const invalid = raw.filter((v) => !field.options!.includes(String(v)));
      if (invalid.length) issues.push(`${field.label}: lựa chọn không hợp lệ`);
    }
  }
  return issues.length ? { ok: false, issues } : { ok: true };
}

export function mapFunnelFormAnswersToLead(
  spec: FunnelCompleteSpec,
  answers: FunnelFormAnswers,
): FunnelLeadMapped {
  let name = '';
  let phone: string | undefined;
  let email: string | undefined;
  const extra: FunnelLeadMapped['extra'] = [];

  for (const field of spec.leadForm.fields) {
    const value = stringifyFunnelAnswer(readFunnelFormAnswer(field, answers) ?? null);
    if (!value) continue;
    if (!name && isNameField(field)) {
      name = value;
      continue;
    }
    if (!phone && isPhoneField(field)) {
      phone = value;
      continue;
    }
    if (!email && isEmailField(field)) {
      email = value;
      continue;
    }
    extra.push({ key: field.key, label: field.label, value });
  }

  if (!name) name = 'Khách Funnel';
  const noteParts = extra.map((e) => `${e.label}: ${e.value}`);
  return {
    name: name.slice(0, 160),
    phone,
    email,
    note: noteParts.length ? noteParts.join('\n').slice(0, 2000) : undefined,
    extra,
  };
}

export function funnelChatbotGreetingFromFlow(spec: FunnelCompleteSpec): string {
  const first = spec.chatbotFlow.steps.find((s) => s.id === spec.chatbotFlow.entryStepId)
    ?? spec.chatbotFlow.steps.find((s) => s.type === 'message')
    ?? spec.chatbotFlow.steps[0];
  const text = first?.content?.trim() || `Chào bạn! ${spec.offer}`;
  return text.slice(0, 500);
}

/** Serialize funnel chatbot steps into knowledge text for existing CSKH AI engine */
export function serializeFunnelChatbotFlowToKnowledge(spec: FunnelCompleteSpec): string {
  const lines = [
    `Kịch bản chatbot Funnel: ${spec.chatbotFlow.name}`,
    `Offer: ${spec.offer}`,
    `CTA: ${spec.cta}`,
    `Mục tiêu: ${spec.conversionGoal.label}`,
    '',
    'Luồng hội thoại (bám sát thứ tự, không bịa thêm):',
  ];
  const byId = new Map(spec.chatbotFlow.steps.map((s) => [s.id, s]));
  let step = byId.get(spec.chatbotFlow.entryStepId) ?? spec.chatbotFlow.steps[0];
  const seen = new Set<string>();
  let i = 1;
  while (step && !seen.has(step.id) && i <= 30) {
    seen.add(step.id);
    const opts = step.options?.map((o) => `"${o.label}" → ${o.nextId}`).join('; ');
    lines.push(
      `${i}. [${step.type}] ${step.content}${opts ? ` | Lựa chọn: ${opts}` : ''}`,
    );
    const nextId = step.nextId ?? step.options?.[0]?.nextId ?? null;
    step = nextId ? byId.get(nextId) : undefined;
    i += 1;
  }
  for (const s of spec.chatbotFlow.steps) {
    if (!seen.has(s.id)) {
      lines.push(`- [${s.type}] ${s.content}`);
    }
  }
  lines.push(
    '',
    'Quy tắc vận hành trên engine CSKH hiện tại:',
    '- Thu nhu cầu, số điện thoại, tư vấn đúng offer, mời đặt lịch.',
    '- Khi khách hỏi giá / đặt lịch / để lại SĐT → hiện form thu lead.',
    '- Bước handoff: chuyển nhân viên, không tự bịa lịch trống.',
    '- Bước book: hướng dẫn đặt lịch, không tạo appointment ngoài hệ thống CRM.',
    `- Kết thúc: xác nhận đã ghi nhận và nhắc CTA "${spec.cta}".`,
  );
  return lines.join('\n').slice(0, 18000);
}
