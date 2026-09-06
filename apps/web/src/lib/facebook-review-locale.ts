'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCurrentUser } from '@/hooks/use-auth';
import { isForcedEnglishUiUser } from '@/lib/meta-reviewer-ui-locale';

export type FacebookReviewLocale = 'en' | 'vi';

/** Primary UI locale key (shared with i18n when enabled). */
export const UI_LOCALE_STORAGE_KEY = 'maz.uiLocale';

/** Legacy key used by Facebook App Review flow. */
const LEGACY_FB_STORAGE_KEY = 'facebook-review-locale';

export const UI_LOCALE_CHANGE_EVENT = 'maz-ui-locale-change';

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function readStoredLocale(): FacebookReviewLocale | null {
  if (!canUseStorage()) return null;
  try {
    for (const key of [UI_LOCALE_STORAGE_KEY, LEGACY_FB_STORAGE_KEY]) {
      const raw = localStorage.getItem(key);
      if (raw === 'en' || raw === 'vi') return raw;
    }
  } catch {
    /* private mode */
  }
  return null;
}

/** Persist UI locale for Facebook review + general interface preference. */
export function persistUiLocale(locale: FacebookReviewLocale): void {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(UI_LOCALE_STORAGE_KEY, locale);
    localStorage.setItem(LEGACY_FB_STORAGE_KEY, locale);
    window.dispatchEvent(new CustomEvent(UI_LOCALE_CHANGE_EVENT, { detail: locale }));
  } catch {
    /* quota / private mode */
  }
}

/** Resolve locale for Meta App Review UI (EN when browser/query/storage is English). */
export function resolveFacebookReviewLocale(
  searchParams?: URLSearchParams | null,
  navigatorLang?: string,
): FacebookReviewLocale {
  const fromUrl = searchParams?.get('lang')?.toLowerCase();
  if (fromUrl === 'en' || fromUrl === 'vi') return fromUrl;

  const stored = readStoredLocale();
  if (stored) return stored;

  const lang =
    navigatorLang ?? (typeof navigator !== 'undefined' ? navigator.language : 'vi-VN');
  if (lang.toLowerCase().startsWith('en')) return 'en';
  return 'vi';
}

export function useFacebookReviewLocale(): FacebookReviewLocale {
  const { data: user } = useCurrentUser();
  const searchParams = useSearchParams();
  const forcedEn = isForcedEnglishUiUser(user);
  const fromQuery = useMemo(() => {
    if (forcedEn) return 'en' as const;
    return resolveFacebookReviewLocale(searchParams);
  }, [searchParams, forcedEn]);
  const [locale, setLocale] = useState<FacebookReviewLocale>(fromQuery);

  useEffect(() => {
    if (forcedEn) {
      setLocale('en');
      return;
    }
    setLocale(resolveFacebookReviewLocale(searchParams));
  }, [searchParams, forcedEn]);

  useEffect(() => {
    if (forcedEn) return;
    const sync = () => setLocale(resolveFacebookReviewLocale(searchParams));
    window.addEventListener(UI_LOCALE_CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(UI_LOCALE_CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [searchParams, forcedEn]);

  return forcedEn ? 'en' : locale;
}

export function usePersistUiLocale() {
  const [, bump] = useState(0);
  return useCallback((locale: FacebookReviewLocale) => {
    persistUiLocale(locale);
    bump((n) => n + 1);
  }, []);
}
