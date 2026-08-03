export function normalizeEmailForUniqueness(email: string): string {
  return String(email || '').trim().toLowerCase();
}

/** Chuẩn hóa số điện thoại VN về dãy số (dùng chống trial trùng thiết bị/SĐT). */
export function normalizePhoneDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = String(phone).replace(/\D+/g, '');
  if (!digits) return null;
  // 84xxxxxxxxx → 0xxxxxxxxx
  if (digits.startsWith('84') && digits.length >= 11) {
    return `0${digits.slice(2)}`;
  }
  return digits;
}
