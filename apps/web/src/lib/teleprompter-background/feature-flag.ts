/**
 * Feature flag: TELEPROMPTER_BACKGROUND_EFFECTS
 *
 * - Explicit true/1/on/yes → ON
 * - Explicit false/0/off → OFF
 * - Unset: ON in browser (camera blur product), OFF in Node/ssr without window
 */

export const TELEPROMPTER_BACKGROUND_EFFECTS_ENV_KEYS = [
  'TELEPROMPTER_BACKGROUND_EFFECTS',
  'NEXT_PUBLIC_TELEPROMPTER_BACKGROUND_EFFECTS',
] as const;

function envTruthy(raw: string | undefined): boolean {
  if (raw == null) return false;
  const v = raw.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}

function envFalsy(raw: string | undefined): boolean {
  if (raw == null) return false;
  const v = raw.trim().toLowerCase();
  return v === '0' || v === 'false' || v === 'off' || v === 'no';
}

/**
 * Pure flag reader — safe to call from browser or Node tests.
 * Accepts optional injected env for unit tests.
 */
export function isTeleprompterBackgroundEffectsEnabled(
  env: Record<string, string | undefined> = typeof process !== 'undefined'
    ? (process.env as Record<string, string | undefined>)
    : {},
): boolean {
  const pub = env.NEXT_PUBLIC_TELEPROMPTER_BACKGROUND_EFFECTS;
  const srv = env.TELEPROMPTER_BACKGROUND_EFFECTS;
  if (envFalsy(pub) || envFalsy(srv)) return false;
  if (envTruthy(pub) || envTruthy(srv)) return true;
  // Unset: enable only in real browsers so Node unit tests stay flag-off by default
  return typeof window !== 'undefined';
}
