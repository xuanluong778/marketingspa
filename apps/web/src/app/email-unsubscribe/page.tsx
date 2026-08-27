'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getApiBaseUrl } from '@/lib/api-client';
import { useT } from '@/i18n/i18n-provider';

function UnsubscribeInner() {
  const t = useT();
  const searchParams = useSearchParams();
  const rid = searchParams.get('rid') || '';
  const [message, setMessage] = useState(() => t('emailUnsubscribe.processing'));

  useEffect(() => {
    if (!rid) {
      setMessage(t('emailUnsubscribe.invalidLink'));
      return;
    }
    const url = `${getApiBaseUrl()}/email-marketing/public/unsubscribe?rid=${encodeURIComponent(rid)}`;
    fetch(url)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMessage(
            typeof body.message === 'string' ? body.message : t('emailUnsubscribe.failed'),
          );
          return;
        }
        setMessage(
          t('emailUnsubscribe.success', { email: body.email || '' }),
        );
      })
      .catch(() => setMessage(t('emailUnsubscribe.serverRetry')));
  }, [rid, t]);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-bold tracking-tight">{t('emailUnsubscribe.title')}</h1>
      <p className="mt-3 text-muted-foreground">{message}</p>
    </main>
  );
}

export default function EmailUnsubscribePage() {
  return (
    <Suspense>
      <UnsubscribeInner />
    </Suspense>
  );
}
