const STORAGE_KEY = 'msa_ref';
const COOKIE_JS = 'msa_ref_js';
const MAX_AGE = 30 * 24 * 60 * 60;
const CODE_RE = /^[A-Z0-9]{4,32}$/;

export function normalizeAffiliateCode(raw?: string | null): string | null {
  if (!raw?.trim()) return null;
  const code = raw.trim().toUpperCase();
  return CODE_RE.test(code) ? code : null;
}

/** Đọc mã ref đã lưu (localStorage → cookie JS) */
export function getStoredAffiliateRef(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const fromLs = normalizeAffiliateCode(localStorage.getItem(STORAGE_KEY));
    if (fromLs) return fromLs;
  } catch {
    /* ignore */
  }
  const m = document.cookie.match(/(?:^|;\s*)msa_ref_js=([^;]+)/i);
  if (m?.[1]) {
    try {
      return normalizeAffiliateCode(decodeURIComponent(m[1]));
    } catch {
      return normalizeAffiliateCode(m[1]);
    }
  }
  return null;
}

/** Lưu mã ref 30 ngày — không HttpOnly (HttpOnly do middleware); dùng gửi header lúc đăng ký */
export function persistAffiliateRef(code: string): string | null {
  const normalized = normalizeAffiliateCode(code);
  if (!normalized || typeof window === 'undefined') return null;
  try {
    localStorage.setItem(STORAGE_KEY, normalized);
  } catch {
    /* ignore */
  }
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${COOKIE_JS}=${encodeURIComponent(normalized)}; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax${secure}`;
  return normalized;
}

/** Bắt ?ref= từ URL hiện tại và lưu */
export function captureAffiliateRefFromUrl(search?: string): string | null {
  if (typeof window === 'undefined') return null;
  const qs = search ?? window.location.search;
  const ref = new URLSearchParams(qs).get('ref');
  return persistAffiliateRef(ref || '');
}
