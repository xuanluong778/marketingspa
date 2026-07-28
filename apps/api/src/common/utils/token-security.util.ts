import { encryptSecret, decryptSecret, maskSecret } from './encryption.util';

const SENSITIVE_KEY_PATTERN =
  /token|secret|password|credential|psid|access_?token|refresh_?token|api_?key|authorization/i;

/** Che PSID / Zalo UID / external user id — chỉ giữ 4 ký tự cuối */
export function maskExternalId(value?: string | null): string {
  if (!value?.trim()) return '';
  return maskSecret(value.trim());
}

/** Che số điện thoại — giữ 3 số cuối */
export function maskPhone(value?: string | null): string {
  if (!value?.trim()) return '';
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 3) return '***';
  return `***${digits.slice(-3)}`;
}

/** Metadata an toàn cho API response / audit — không lộ token hay id đầy đủ */
export function sanitizePublicMetadata(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      out[key] = typeof value === 'string' ? maskSecret(value) : '[redacted]';
      continue;
    }
    if (key === 'externalAccountId' && typeof value === 'string') {
      out[key] = maskExternalId(value);
      continue;
    }
    if (key === 'externalUserId' && typeof value === 'string') {
      out[key] = maskExternalId(value);
      continue;
    }
    out[key] = value;
  }
  return out;
}

/** Loại bỏ field nhạy cảm khỏi object trước khi ghi audit/log */
export function redactForAudit(payload: unknown): unknown {
  if (payload === null || payload === undefined) return payload;
  if (Array.isArray(payload)) return payload.map(redactForAudit);
  if (typeof payload !== 'object') {
    return typeof payload === 'string' && payload.length > 20 ? maskSecret(payload) : payload;
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (
      key === 'encryptedCredentials' ||
      key === 'pageAccessTokenEncrypted' ||
      key === 'encryptedAccessToken' ||
      key === 'encryptedPageAccessToken'
    ) {
      out[key] = '[redacted]';
    } else if (SENSITIVE_KEY_PATTERN.test(key)) {
      out[key] = typeof value === 'string' ? maskSecret(value) : '[redacted]';
    } else if (typeof value === 'object') {
      out[key] = redactForAudit(value);
    } else if (typeof value === 'string' && (key === 'externalUserId' || key === 'psid')) {
      out[key] = maskExternalId(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Đảm bảo response integration không chứa credential */
export function assertNoCredentialLeak(response: unknown, rawToken?: string): void {
  const json = JSON.stringify(response);
  if (json.includes('encryptedCredentials')) {
    throw new Error('API response leaked encryptedCredentials');
  }
  if (rawToken && rawToken.length > 8 && json.includes(rawToken)) {
    throw new Error('API response leaked raw token');
  }
}

export function encodeStoredSecret(plaintext: string, encryptionKey: string): string {
  return encryptSecret(plaintext, encryptionKey);
}

/** Giải mã token đã lưu — hỗ trợ legacy base64 plain */
export function decodeStoredSecret(stored: string, encryptionKey: string): string {
  if (!stored?.trim()) return '';
  try {
    return decryptSecret(stored, encryptionKey);
  } catch {
    try {
      const legacy = Buffer.from(stored, 'base64').toString('utf8').trim();
      if (legacy && !legacy.includes('\0')) return legacy;
    } catch {
      /* ignore */
    }
    return '';
  }
}
