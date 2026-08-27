'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  FunnelPublicFormView,
  type FunnelFormPayload,
} from '@/components/funnel/funnel-public-form-view';
import { getApiBaseUrl } from '@/lib/api-client';
import { useT } from '@/i18n/i18n-provider';

/**
 * Public funnel — khách chỉ xem/gửi form. Không có chế độ sửa (kể cả khi đã login).
 * Chỉnh sửa nội dung: /funnel/preview/[id] trong quản trị.
 */
export default function PublicFunnelFormPage() {
  const t = useT();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [payload, setPayload] = useState<FunnelFormPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const api = useMemo(() => getApiBaseUrl(), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${api}/funnel-builder/public/${id}/form`);
        const body = (await res.json()) as FunnelFormPayload & { message?: string };
        if (!res.ok) throw new Error(body.message || 'Không tải được form');
        if (!cancelled) {
          setPayload({
            ...body,
            canEdit: false,
            editMode: false,
          });
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Lỗi tải form');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [api, id]);

  if (loading) {
    return (
      <main className="mx-auto min-h-screen max-w-lg px-4 py-10">
        <div className="rounded-xl border border-white/10 bg-card p-6 text-center">{t('funnel.loadingForm')}</div>
      </main>
    );
  }

  if (error && !payload) {
    return (
      <main className="mx-auto min-h-screen max-w-lg px-4 py-10">
        <div className="rounded-xl border border-white/10 bg-card p-6 text-center text-red-300">{error}</div>
      </main>
    );
  }

  if (!payload) return null;

  return <FunnelPublicFormView initial={payload} apiBase={api} />;
}
