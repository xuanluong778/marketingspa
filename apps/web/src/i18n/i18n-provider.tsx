'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { translate } from './index';
import { getStoredLocale, resolveInitialLocale, setStoredLocale } from './locale-storage';
import {
  DEFAULT_UI_LOCALE,
  isUiLocale,
  type TranslateParams,
  type UiLocale,
} from './types';

export type SetLocaleOptions = {
  /**
   * When true (default), invoke `onPersist` after updating local state.
   * Set false when hydrating from `/auth/me` so we do not PATCH the same value back.
   */
  persist?: boolean;
};

type I18nContextValue = {
  locale: UiLocale;
  setLocale: (locale: UiLocale, options?: SetLocaleOptions) => void;
  t: (key: string, params?: TranslateParams) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export type I18nProviderProps = {
  children: ReactNode;
  /**
   * Server/user locale from `/auth/me` (`user.uiLocale`).
   * When logged in and valid, preferred over localStorage.
   */
  initialLocale?: UiLocale | null;
  /**
   * Optional persist hook — e.g. `PATCH /auth/locale` with `{ uiLocale }`.
   * Wired by callers when the API is available.
   */
  onPersist?: (locale: UiLocale) => void | Promise<void>;
};

function applyDocumentLang(locale: UiLocale) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale;
}

export function I18nProvider({ children, initialLocale, onPersist }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<UiLocale>(() =>
    resolveInitialLocale(isUiLocale(initialLocale) ? initialLocale : null),
  );

  // Prefer server user locale when it becomes available (logged-in hydrate).
  useEffect(() => {
    if (!isUiLocale(initialLocale)) return;
    setLocaleState((prev) => {
      if (prev === initialLocale) return prev;
      setStoredLocale(initialLocale);
      applyDocumentLang(initialLocale);
      return initialLocale;
    });
  }, [initialLocale]);

  // After hydration: apply stored locale, then sync <html lang>.
  // Reading localStorage in useState would desync SSR (always vi) and crash.
  useEffect(() => {
    if (isUiLocale(initialLocale)) {
      applyDocumentLang(initialLocale);
      return;
    }
    const stored = getStoredLocale();
    if (stored) {
      setLocaleState((prev) => {
        if (prev === stored) return prev;
        applyDocumentLang(stored);
        return stored;
      });
      applyDocumentLang(stored);
      return;
    }
    applyDocumentLang(locale);
    setStoredLocale(locale);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- bootstrap once

  const setLocale = useCallback(
    (next: UiLocale, options?: SetLocaleOptions) => {
      if (!isUiLocale(next)) return;
      const shouldPersist = options?.persist !== false;
      setLocaleState(next);
      setStoredLocale(next);
      applyDocumentLang(next);
      if (shouldPersist && onPersist) {
        void Promise.resolve(onPersist(next)).catch(() => {
          /* persist failures should not break UI locale switch */
        });
      }
    },
    [onPersist],
  );

  const t = useCallback(
    (key: string, params?: TranslateParams) => translate(locale, key, params),
    [locale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return ctx;
}

/** Convenience hook returning only `t`. */
export function useT(): I18nContextValue['t'] {
  return useI18n().t;
}

/** Safe fallback when outside provider (e.g. early SSR edge). */
export function useI18nOptional(): I18nContextValue | null {
  return useContext(I18nContext);
}

export { DEFAULT_UI_LOCALE };
