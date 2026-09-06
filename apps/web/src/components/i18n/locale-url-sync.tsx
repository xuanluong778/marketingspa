'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useCurrentUser } from '@/hooks/use-auth';
import { useI18n } from '@/i18n/i18n-provider';
import { isUiLocale } from '@/i18n/types';
import { isForcedEnglishUiUser } from '@/lib/meta-reviewer-ui-locale';

/** Apply ?lang=en|vi to global i18n (keeps Facebook review URL convention). Meta reviewer stays EN. */
export function LocaleUrlSync() {
  const searchParams = useSearchParams();
  const { data: user } = useCurrentUser();
  const { setLocale } = useI18n();

  useEffect(() => {
    if (isForcedEnglishUiUser(user)) {
      setLocale('en', { persist: false });
      return;
    }
    const raw = searchParams.get('lang')?.toLowerCase();
    if (isUiLocale(raw)) {
      setLocale(raw);
    }
  }, [searchParams, user, setLocale]);

  return null;
}
