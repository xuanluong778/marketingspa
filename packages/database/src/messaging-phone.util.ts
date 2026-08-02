/**
 * Chuẩn hóa SĐT VN cho liên kết identity ↔ Customer/Lead.
 * Không dùng tên — chỉ phone đã xác minh mới auto-gợi ý liên kết.
 */
export function normalizeMessagingPhone(phone?: string | null): string | null {
  if (!phone?.trim()) return null;
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('84') && digits.length >= 11) {
    digits = `0${digits.slice(2)}`;
  }
  if (digits.startsWith('0') && digits.length >= 10) {
    return digits;
  }
  if (digits.length >= 9 && digits.length <= 11) {
    return digits.startsWith('0') ? digits : `0${digits}`;
  }
  return null;
}

export function buildIntegrationScopeKey(params: {
  integrationId?: string | null;
  channel: string;
  channelAccountRef?: string | null;
}): string {
  if (params.integrationId) {
    return `integration:${params.integrationId}`;
  }
  const ref = params.channelAccountRef?.trim();
  if (!ref) {
    throw new Error('channelAccountRef bắt buộc khi chưa có integrationId');
  }
  return `${params.channel.toLowerCase()}:${ref}`;
}
