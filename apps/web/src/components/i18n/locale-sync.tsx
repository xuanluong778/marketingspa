'use client';

import { useEffect, useRef } from 'react';
import { useCurrentUser } from '@/hooks/use-auth';
import { useI18n } from '@/i18n/i18n-provider';
import { isUiLocale } from '@/i18n/types';

/**
 * Hydrate locale from `/auth/me` once per server value.
 * Do not depend on current `locale` — that would revert a user click
 * before PATCH /auth/locale finishes.
 */
export function LocaleSync() {
  const { data: user } = useCurrentUser();
  const { setLocale } = useI18n();
  const lastSynced = useRef<string | null>(null);

  useEffect(() => {
    const next = user?.uiLocale;
    if (!isUiLocale(next)) return;
    if (lastSynced.current === next) return;
    lastSynced.current = next;
    setLocale(next, { persist: false });
  }, [user?.uiLocale, setLocale]);

  return null;
}
