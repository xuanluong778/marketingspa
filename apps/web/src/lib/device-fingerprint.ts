/** Fingerprint thiết bị ổn định trong browser — chống tái kích hoạt trial */
export function getDeviceFingerprint(): string {
  if (typeof window === 'undefined') return '';
  const KEY = 'ma_device_fp_v1';
  try {
    const existing = window.localStorage.getItem(KEY);
    if (existing && existing.length >= 16) return existing;

    const parts = [
      navigator.userAgent,
      navigator.language,
      String(screen.width),
      String(screen.height),
      String(window.devicePixelRatio || 1),
      Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    ];
    let h = 0;
    const raw = parts.join('|');
    for (let i = 0; i < raw.length; i++) {
      h = (Math.imul(31, h) + raw.charCodeAt(i)) | 0;
    }
    const fp = `fp_${Math.abs(h).toString(36)}_${crypto.randomUUID().replace(/-/g, '')}`;
    window.localStorage.setItem(KEY, fp);
    return fp;
  } catch {
    return `fp_fallback_${Date.now().toString(36)}`;
  }
}
