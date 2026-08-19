'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getApiBaseUrl } from '@/lib/api-client';

function UnsubscribeInner() {
  const searchParams = useSearchParams();
  const rid = searchParams.get('rid') || '';
  const [message, setMessage] = useState('Đang xử lý hủy đăng ký…');

  useEffect(() => {
    if (!rid) {
      setMessage('Liên kết hủy đăng ký không hợp lệ.');
      return;
    }
    const url = `${getApiBaseUrl()}/email-marketing/public/unsubscribe?rid=${encodeURIComponent(rid)}`;
    fetch(url)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMessage(typeof body.message === 'string' ? body.message : 'Không hủy đăng ký được.');
          return;
        }
        setMessage(`Đã hủy đăng ký email ${body.email || ''}. Bạn sẽ không nhận thêm chiến dịch từ tổ chức này.`);
      })
      .catch(() => setMessage('Không kết nối được máy chủ. Thử lại sau.'));
  }, [rid]);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-bold tracking-tight">Hủy đăng ký email</h1>
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
