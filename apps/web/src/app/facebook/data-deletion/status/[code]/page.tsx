import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, Clock3, HelpCircle, Trash2 } from 'lucide-react';
import { BrandLogo } from '@/components/brand/brand-logo';
import { Button } from '@/components/ui/button';

type StatusPayload = {
  confirmation_code: string;
  status: string;
  message: string;
  completed_at: string | null;
  facebook_user_id_masked: string | null;
  pages_removed?: number;
  posts_anonymized?: number;
  scheduled_cancelled?: number;
};

export const metadata: Metadata = {
  title: 'Facebook data deletion status | MarketingAutoAZ',
  description: 'Check the status of a Facebook data deletion request for MarketingAutoAZ.',
  robots: { index: false, follow: false },
};

async function fetchStatus(code: string): Promise<StatusPayload | null> {
  const apiBase = (
    process.env.API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'https://marketingautoaz.com'
  ).replace(/\/$/, '');
  const url = `${apiBase}/api/v1/auto-post/facebook/data-deletion/status/${encodeURIComponent(code)}`;
  try {
    const res = await fetch(url, { next: { revalidate: 0 }, cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as StatusPayload;
  } catch {
    return null;
  }
}

function StatusIcon({ status }: { status: string }) {
  const s = status.toUpperCase();
  if (s === 'COMPLETED') return <CheckCircle2 className="h-6 w-6 text-emerald-400" />;
  if (s === 'NOT_FOUND') return <HelpCircle className="h-6 w-6 text-amber-400" />;
  return <Clock3 className="h-6 w-6 text-[#F97316]" />;
}

export default async function FacebookDataDeletionStatusPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: raw } = await params;
  const code = decodeURIComponent(raw || '').trim();
  const data = code ? await fetchStatus(code) : null;
  const status = data?.status || 'UNKNOWN';
  const message =
    data?.message ||
    (code
      ? 'Unable to load status right now. Please try again later or email support.'
      : 'Missing confirmation code.');

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-white/10 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto flex items-center justify-between px-4 py-4 sm:px-6">
          <BrandLogo size={32} wordmark="MarketingAutoAZ" wordmarkClassName="text-xl" />
          <div className="flex items-center gap-3">
            <Link
              href="/facebook/data-deletion"
              className="text-sm text-muted-foreground hover:text-white"
            >
              Data deletion guide
            </Link>
            <Button
              variant="outline"
              className="border-white/20 bg-transparent text-white hover:bg-white/10"
              asChild
            >
              <Link href="/privacy">Privacy</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#F97316]">
          <Trash2 className="h-4 w-4" />
          Meta · Data deletion status
        </div>
        <h1 className="text-3xl font-extrabold text-white">Deletion request status</h1>
        <p className="mt-3 text-muted-foreground">
          This page confirms the status of a Facebook data deletion request for MarketingAutoAZ.
        </p>

        <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-start gap-3">
            <StatusIcon status={status} />
            <div className="space-y-2">
              <p className="text-lg font-semibold text-white">{status}</p>
              <p className="text-sm text-muted-foreground">{message}</p>
              {code ? (
                <p className="text-xs text-muted-foreground">
                  Confirmation code:{' '}
                  <code className="rounded bg-white/10 px-1.5 py-0.5 text-white">{code}</code>
                </p>
              ) : null}
              {data?.facebook_user_id_masked ? (
                <p className="text-xs text-muted-foreground">
                  Facebook user (masked): {data.facebook_user_id_masked}
                </p>
              ) : null}
              {data?.completed_at ? (
                <p className="text-xs text-muted-foreground">Completed at: {data.completed_at}</p>
              ) : null}
              {typeof data?.pages_removed === 'number' ? (
                <p className="text-xs text-muted-foreground">
                  Pages removed: {data.pages_removed} · Posts anonymized:{' '}
                  {data.posts_anonymized ?? 0} · Scheduled cancelled:{' '}
                  {data.scheduled_cancelled ?? 0}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button className="bg-[#F97316] text-white hover:bg-[#ea6a0c]" asChild>
            <Link href="/facebook/data-deletion">Back to deletion instructions</Link>
          </Button>
          <Button
            variant="outline"
            className="border-white/20 bg-transparent text-white hover:bg-white/10"
            asChild
          >
            <Link href="/facebook-integration">Facebook integration</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
