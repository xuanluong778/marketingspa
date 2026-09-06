import type { AuthUser } from '@/types/api';
import type { UiLocale } from '@/i18n/types';

/** Meta App Reviewer — UI locked to English when server sets forceUiLocale. */
export function isForcedEnglishUiUser(user: AuthUser | null | undefined): boolean {
  return Boolean(user?.forceUiLocale && user.uiLocale === 'en');
}

export function resolveForcedUiLocale(user: AuthUser | null | undefined): UiLocale | null {
  return isForcedEnglishUiUser(user) ? 'en' : null;
}
