export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount);
}

/** 1000000 → 1.000.000đ */
export function formatVnd(amount: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(Math.round(amount))}đ`;
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso));
}
