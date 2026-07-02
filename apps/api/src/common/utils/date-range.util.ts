export type PeriodType = 'day' | 'week' | 'month';

export function resolveDateRange(
  period: PeriodType,
  referenceDate?: string,
): { from: Date; to: Date } {
  const ref = referenceDate ? new Date(referenceDate) : new Date();
  ref.setHours(0, 0, 0, 0);

  if (period === 'day') {
    const to = new Date(ref);
    to.setHours(23, 59, 59, 999);
    return { from: ref, to };
  }

  if (period === 'week') {
    const day = ref.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const from = new Date(ref);
    from.setDate(ref.getDate() + diff);
    const to = new Date(from);
    to.setDate(from.getDate() + 6);
    to.setHours(23, 59, 59, 999);
    return { from, to };
  }

  // month
  const from = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const to = new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 23, 59, 59, 999);
  return { from, to };
}

export function resolveCalendarRange(
  view: 'day' | 'week' | 'month',
  date?: string,
): { from: Date; to: Date } {
  return resolveDateRange(view, date);
}
