import type { QueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { authStorage } from '@/lib/auth-storage';
import { persistUiLocale } from '@/lib/facebook-review-locale';
import { setStoredLocale } from '@/i18n/locale-storage';
import type { UiLocale } from '@/i18n/types';
import type { AuthUser } from '@/types/api';

/** Persist UI locale to localStorage + legacy FB keys + user profile when logged in. */
export async function persistUserUiLocale(
  locale: UiLocale,
  queryClient?: QueryClient,
): Promise<void> {
  setStoredLocale(locale);
  persistUiLocale(locale);
  if (!authStorage.isAuthenticated()) return;
  try {
    const user = await apiClient<AuthUser>('/auth/locale', {
      method: 'PATCH',
      body: JSON.stringify({ locale }),
    });
    queryClient?.setQueryData(['auth', 'me'], user);
  } catch {
    /* offline / API unavailable — localStorage still holds the choice */
  }
}
