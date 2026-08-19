const TZ = 'Asia/Ho_Chi_Minh';

/** HH:mm DD/MM/YYYY theo Asia/Ho_Chi_Minh. Ưu tiên chuỗi server, không fake. */
export function formatFanpageSyncDisplay(
  display?: string | null,
  iso?: string | null,
): string | null {
  const ready = typeof display === 'string' ? display.trim() : '';
  if (ready) return ready;
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour12: false,
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  const hour = get('hour');
  const minute = get('minute');
  const day = get('day');
  const month = get('month');
  const year = get('year');
  if (!hour || !minute || !day || !month || !year) return null;
  return `${hour}:${minute} ${day}/${month}/${year}`;
}
