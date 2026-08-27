'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { initSentry } from '@/lib/sentry';
import { AffiliateRefCapture } from '@/components/affiliate/affiliate-ref-capture';
import { LocaleSync } from '@/components/i18n/locale-sync';
import { I18nProvider } from '@/i18n/i18n-provider';
import { apiClient } from '@/lib/api-client';
import type { AuthUser } from '@/types/api';

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            gcTime: 10 * 60_000,
            retry: 1,
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
          },
        },
      }),
  );

  useEffect(() => {
    initSentry();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider
        onPersist={async (locale) => {
          try {
            const user = await apiClient<AuthUser>('/auth/locale', {
              method: 'PATCH',
              body: JSON.stringify({ locale }),
            });
            queryClient.setQueryData(['auth', 'me'], user);
          } catch {
            /* persist failures should not break UI locale switch */
          }
        }}
      >
        <LocaleSync />
        <AffiliateRefCapture />
        {children}
      </I18nProvider>
    </QueryClientProvider>
  );
}
