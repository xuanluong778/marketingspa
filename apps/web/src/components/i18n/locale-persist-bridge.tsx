'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/hooks/use-auth';
import { I18nProvider } from '@/i18n/i18n-provider';
import { LocaleSync } from '@/components/i18n/locale-sync';
import { LocaleUrlSync } from '@/components/i18n/locale-url-sync';
import { persistUserUiLocale } from '@/lib/persist-user-ui-locale';
import { isForcedEnglishUiUser } from '@/lib/meta-reviewer-ui-locale';
import type { UiLocale } from '@/i18n/types';

/** Wires locale changes to localStorage + PATCH /auth/locale for logged-in users. */
export function LocalePersistBridge({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();

  const onPersist = useCallback(
    (locale: UiLocale) => {
      if (isForcedEnglishUiUser(user) && locale !== 'en') return;
      void persistUserUiLocale(locale, queryClient);
    },
    [queryClient, user],
  );

  return (
    <I18nProvider onPersist={onPersist}>
      <LocaleSync />
      {children}
    </I18nProvider>
  );
}

export { LocaleUrlSync };
