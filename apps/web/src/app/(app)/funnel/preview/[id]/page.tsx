'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import {
  FunnelPublicFormView,
  type FunnelFormPayload,
} from '@/components/funnel/funnel-public-form-view';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/shared/page-state';
import { fetchFunnelPreviewForm } from '@/hooks/use-funnel-inline-edit';
import { publicFunnelUrl } from '@/components/funnel/funnel-test-dialog';
import { getApiBaseUrl } from '@/lib/api-client';
import { funnelHref } from '@/lib/funnel-tabs';
import { useT } from '@/i18n/i18n-provider';

/**
 * Xem trước + sửa trực tiếp — chỉ trong quản trị (AuthGuard). Không dùng link publish /f/[id].
 */
export default function FunnelAdminPreviewPage() {
  const t = useT();
  const params = useParams<{ id: string }>();
  const router = useRouter();
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
      const preview = await fetchFunnelPreviewForm(id);
      if (!cancelled && preview.ok && preview.data) {
        setPayload(preview.data as unknown as FunnelFormPayload);
        setLoading(false);
        return;
      }
      if (!cancelled) {
        setError('Không mở được xem trước — kiểm tra quyền hoặc phễu thuộc tổ chức của bạn.');
        setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="mx-auto max-w-lg py-8">
        <LoadingState message={t('funnel.loadingPreview')} />
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-8">
        <p className="text-sm text-destructive">{error ?? 'Không tải được phễu'}</p>
        <Button variant="outline" onClick={() => router.replace(funnelHref({ tab: 'mine' }))}>
          Về Phễu của tôi
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 border-b pb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={funnelHref({ tab: 'mine', design: id })}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Quản trị phễu
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <a href={publicFunnelUrl(id)} target="_blank" rel="noopener noreferrer">
            Link khách (chỉ xem)
          </a>
        </Button>
      </div>
      <FunnelPublicFormView initial={payload} apiBase={api} />
    </div>
  );
}
