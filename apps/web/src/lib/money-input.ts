export function parseMoneyInput(value: string): number {
  const digits = value.replace(/\D/g, '');
  if (!digits) return 0;
  const parsed = parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatMoneyInput(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '';
  return new Intl.NumberFormat('vi-VN').format(Math.round(value));
}

export function formatMoneyDisplay(value: number): string {
  if (!Number.isFinite(value)) return '0đ';
  return `${new Intl.NumberFormat('vi-VN').format(Math.round(value))}đ`;
}
