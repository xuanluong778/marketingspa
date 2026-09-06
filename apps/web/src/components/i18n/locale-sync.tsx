'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/hooks/use-auth';
import { useI18n } from '@/i18n/i18n-provider';
import { getStoredLocale, setStoredLocale } from '@/i18n/locale-storage';
import { isUiLocale } from '@/i18n/types';
import { persistUiLocale } from '@/lib/facebook-review-locale';
import { isForcedEnglishUiUser } from '@/lib/meta-reviewer-ui-locale';
import { persistUserUiLocale } from '@/lib/persist-user-ui-locale';

/**
 * Hydrate locale from `/auth/me` once per server value.
 * Meta App Review account: always English (server wins over localStorage).
 * Other users: when localStorage differs from server, push localStorage to the server.
 */
export function LocaleSync() {
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const { setLocale } = useI18n();
  const lastSynced = useRef<string | null>(null);
  const reconciled = useRef(false);

  useEffect(() => {
    if (isForcedEnglishUiUser(user)) {
      if (lastSynced.current === 'en') return;
      lastSynced.current = 'en';
      setStoredLocale('en');
      persistUiLocale('en');
      setLocale('en', { persist: false });
      return;
    }

    const server = user?.uiLocale;
    if (!isUiLocale(server)) return;

    const stored = getStoredLocale();

    if (!reconciled.current) {
      reconciled.current = true;
      if (stored && stored !== server) {
        lastSynced.current = stored;
        setLocale(stored, { persist: false });
        void persistUserUiLocale(stored, queryClient);
        return;
      }
    }

    if (lastSynced.current === server) return;
    lastSynced.current = server;
    setLocale(server, { persist: false });
  }, [user, user?.uiLocale, user?.forceUiLocale, setLocale, queryClient]);

  return null;
}
