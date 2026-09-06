/** Preset kênh liên hệ trên form phễu (dropdown + tùy chỉnh khi chọn Khác). */
export const FUNNEL_CONTACT_CHANNEL_OPTIONS = [
  'Zalo',
  'Điện thoại',
  'Email',
  'Messenger',
  'WhatsApp',
  'SMS',
  'Khác',
] as const;

export const FUNNEL_CONTACT_CHANNEL_OTHER = 'Khác';

/** Mã enum nội bộ CRM (backward-compatible — hiển thị vẫn dùng label tiếng Việt). */
export const FUNNEL_CONTACT_CHANNEL_CODE = {
  ZALO: 'ZALO',
  PHONE: 'PHONE',
  EMAIL: 'EMAIL',
  MESSENGER: 'MESSENGER',
  WHATSAPP: 'WHATSAPP',
  SMS: 'SMS',
  OTHER: 'OTHER',
} as const;

export type FunnelContactChannelCode =
  (typeof FUNNEL_CONTACT_CHANNEL_CODE)[keyof typeof FUNNEL_CONTACT_CHANNEL_CODE];

const CONTACT_LABEL_TO_CODE: Record<string, FunnelContactChannelCode> = {
  Zalo: 'ZALO',
  'Điện thoại': 'PHONE',
  Email: 'EMAIL',
  Messenger: 'MESSENGER',
  WhatsApp: 'WHATSAPP',
  SMS: 'SMS',
  Khác: 'OTHER',
};

/** SĐT Việt Nam: 0 + 9–10 chữ số (3/5/7/8/9…) hoặc +84… */
export function isValidVietnamesePhone(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (/^0(3|5|7|8|9)\d{8}$/.test(digits)) return true;
  if (/^84(3|5|7|8|9)\d{8}$/.test(digits)) return true;
  return false;
}

export function mapFunnelContactChannelToCode(value: string): FunnelContactChannelCode {
  const v = value.trim();
  if (!v) return FUNNEL_CONTACT_CHANNEL_CODE.OTHER;
  return CONTACT_LABEL_TO_CODE[v] ?? FUNNEL_CONTACT_CHANNEL_CODE.OTHER;
}

export function mapFunnelContactChannelCodeToLabel(code: string): string {
  const entry = Object.entries(CONTACT_LABEL_TO_CODE).find(([, c]) => c === code);
  return entry?.[0] ?? code;
}

/** Legacy khung giờ (select Sáng/Chiều/Tối) — vẫn hợp lệ cho phễu cũ. */
export const FUNNEL_LEGACY_TIME_SLOTS = ['Sáng', 'Chiều', 'Tối'] as const;

const DATETIME_LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export type FunnelDatetimeParts = { date: string; time: string };

export function parseFunnelDatetimeLocal(value: string): FunnelDatetimeParts {
  const v = value.trim();
  if (!v || (FUNNEL_LEGACY_TIME_SLOTS as readonly string[]).includes(v)) {
    return { date: '', time: '' };
  }
  if (DATETIME_LOCAL_RE.test(v)) {
    const [date, time] = v.split('T');
    return { date: date ?? '', time: time ?? '' };
  }
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  const date = [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
  const time = [String(d.getHours()).padStart(2, '0'), String(d.getMinutes()).padStart(2, '0')].join(
    ':',
  );
  return { date, time };
}

export function combineFunnelDatetimeLocal(date: string, time: string): string {
  const d = date.trim();
  const t = time.trim();
  if (!d || !t) return '';
  const combined = `${d}T${t}`;
  return isFunnelDatetimeValue(combined) ? combined : '';
}

export function isFunnelDatetimeValue(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (DATETIME_LOCAL_RE.test(v)) {
    const d = new Date(v);
    return !Number.isNaN(d.getTime());
  }
  const d = new Date(v);
  return !Number.isNaN(d.getTime()) && v.includes('-');
}

export function formatFunnelDatetimeDisplay(value: string, locale = 'vi-VN'): string {
  const v = value.trim();
  if (!v) return '';
  if ((FUNNEL_LEGACY_TIME_SLOTS as readonly string[]).includes(v)) return v;
  let d: Date;
  if (DATETIME_LOCAL_RE.test(v)) {
    d = new Date(v);
  } else {
    d = new Date(v);
  }
  if (Number.isNaN(d.getTime())) return v;
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

export function isFunnelContactChannelPreset(value: string, options?: string[]): boolean {
  const presets = options?.length ? options : [...FUNNEL_CONTACT_CHANNEL_OPTIONS];
  return presets.includes(value);
}

export function normalizeFunnelContactChannelAnswer(
  selected: string,
  customText?: string,
): string {
  const sel = selected.trim();
  if (sel === FUNNEL_CONTACT_CHANNEL_OTHER) {
    return (customText ?? '').trim();
  }
  return sel;
}
