/** Quiet hours helpers — Asia/Ho_Chi_Minh by default */

export function parseHm(hm: string): { h: number; m: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return { h, m: min };
}

export function getZonedParts(date: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: string;
} {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === '24' ? '0' : parts.hour),
    minute: Number(parts.minute),
    weekday: parts.weekday ?? '',
  };
}

/** true nếu now nằm trong quiet hours (hỗ trợ overnight, vd 22:00–08:00) */
export function isInQuietHours(
  now: Date,
  quietStart: string | null | undefined,
  quietEnd: string | null | undefined,
  timeZone = 'Asia/Ho_Chi_Minh',
): boolean {
  if (!quietStart || !quietEnd) return false;
  const start = parseHm(quietStart);
  const end = parseHm(quietEnd);
  if (!start || !end) return false;

  const z = getZonedParts(now, timeZone);
  const mins = z.hour * 60 + z.minute;
  const s = start.h * 60 + start.m;
  const e = end.h * 60 + end.m;

  if (s === e) return false;
  if (s < e) return mins >= s && mins < e;
  return mins >= s || mins < e;
}

/** Thời điểm kết thúc quiet hours tiếp theo (UTC Date) trong timezone org */
export function nextQuietHoursEnd(
  now: Date,
  quietStart: string | null | undefined,
  quietEnd: string | null | undefined,
  timeZone = 'Asia/Ho_Chi_Minh',
): Date | null {
  if (!quietStart || !quietEnd) return null;
  if (!isInQuietHours(now, quietStart, quietEnd, timeZone)) return null;

  const end = parseHm(quietEnd);
  if (!end) return null;

  const z = getZonedParts(now, timeZone);
  const endMins = end.h * 60 + end.m;
  const nowMins = z.hour * 60 + z.minute;

  // Overnight: nếu đang sau quietStart (vd 23h), quiet end là ngày hôm sau
  const start = parseHm(quietStart)!;
  const startMins = start.h * 60 + start.m;
  let dayOffset = 0;
  if (startMins > endMins) {
    // overnight window
    if (nowMins >= startMins) dayOffset = 1;
  }

  const targetLocal = new Date(
    Date.UTC(z.year, z.month - 1, z.day + dayOffset, end.h, end.m, 0),
  );

  // Convert "wall clock in TZ" → UTC via iterative offset estimate
  return zonedLocalToUtc(z.year, z.month, z.day + dayOffset, end.h, end.m, timeZone);
}

function zonedLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  // Start with assuming UTC equals local, then correct by timezone offset
  let guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 3; i++) {
    const parts = getZonedParts(new Date(guess), timeZone);
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
    const desired = Date.UTC(year, month - 1, day, hour, minute, 0);
    guess += desired - asUtc;
  }
  return new Date(guess);
}

export function normalizeOptOutText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchesOptOutKeyword(text: string | undefined | null, keywords: string[]): boolean {
  if (!text?.trim() || !keywords.length) return false;
  const normalized = normalizeOptOutText(text);
  return keywords.some((kw) => {
    const k = normalizeOptOutText(kw);
    return k && (normalized === k || normalized.includes(k));
  });
}
