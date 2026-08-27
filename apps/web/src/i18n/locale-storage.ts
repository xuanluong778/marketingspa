import { DEFAULT_UI_LOCALE, isUiLocale, type UiLocale } from './types';

export const UI_LOCALE_STORAGE_KEY = 'maz.uiLocale';

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

/** SSR-safe read of persisted UI locale. */
export function getStoredLocale(): UiLocale | null {
  if (!canUseStorage()) return null;
  try {
    const raw = localStorage.getItem(UI_LOCALE_STORAGE_KEY);
    return isUiLocale(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** SSR-safe write of UI locale to localStorage. */
export function setStoredLocale(locale: UiLocale): void {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(UI_LOCALE_STORAGE_KEY, locale);
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Locale for the first render (SSR + client hydrate).
 * Must NOT read localStorage — that would mismatch server HTML (vi) vs
 * the first client paint (en) and throw React #418.
 * Apply `getStoredLocale()` in a post-mount effect instead.
 */
export function resolveInitialLocale(preferred?: UiLocale | null): UiLocale {
  if (isUiLocale(preferred)) return preferred;
  return DEFAULT_UI_LOCALE;
}
