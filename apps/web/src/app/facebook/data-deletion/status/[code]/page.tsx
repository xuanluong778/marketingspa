import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, Clock3, HelpCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BrandLogo } from '@/components/brand/brand-logo';

type StatusPayload = {
  confirmation_code: string;
  status: 'PENDING' | 'COMPLETED' | 'NOT_FOUND' | string;
  message: string;
  completed_at: string | null;
  facebook_user_id_masked: string | null;
  pages_removed?: number;
  posts_anonymized?: number;
  scheduled_cancelled?: number;
};

type PageProps = {
  params: Promise<{ code: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params;
  return {
    title: `Trạng thái xóa dữ liệu Facebook | ${code}`,
    robots: { index: false, follow: false },
    alternates: {
      canonical: `https://marketingautoaz.com/facebook/data-deletion/status/${encodeURIComponent(code)}`,
    },
  };
}

async function fetchStatus(code: string): Promise<StatusPayload> {
  const apiBase =
    process.env.API_URL?.replace(/\/$/, '') ||
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ||
    'https://marketingautoaz.com/api/v1';
  const url = `${apiBase}/auto-post/facebook/data-deletion/status/${encodeURIComponent(code)}`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      return {
        confirmation_code: code,
        status: 'NOT_FOUND',
        message: 'Không kiểm tra được trạng thái lúc này. Vui lòng thử lại sau.',
        completed_at: null,
        facebook_user_id_masked: null,
      };
    }
    return (await res.json()) as StatusPayload;
  } catch {
    return {
      confirmation_code: code,
      status: 'NOT_FOUND',
      message: 'Không kết nối được máy chủ trạng thái.',
      completed_at: null,
      facebook_user_id_masked: null,
    };
  }
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'COMPLETED') {
    return <CheckCircle2 className="h-8 w-8 text-emerald-400" />;
  }
  if (status === 'PENDING') {
    return <Clock3 className="h-8 w-8 text-amber-400" />;
  }
  return <HelpCircle className="h-8 w-8 text-muted-foreground" />;
}

export default async function FacebookDataDeletionStatusPage({ params }: PageProps) {
  const { code } = await params;
  const status = await fetchStatus(code);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-white/10 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto flex items-center justify-between py-4 px-4 sm:px-6">
          <BrandLogo size={32} wordmark="MarketingAutoAZ" wordmarkClassName="text-xl" />
          <div className="flex items-center gap-4">
            <Link
              href="/facebook/data-deletion"
              className="text-sm font-medium text-muted-foreground hover:text-white transition-colors"
            >
              Hướng dẫn xóa dữ liệu
            </Link>
            <Button
              variant="outline"
              className="border-white/20 bg-transparent text-white hover:bg-white/10"
              asChild
            >
              <Link href="/">Trang chủ</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 py-12 md:py-16 max-w-2xl">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#F97316] mb-3">
          <Trash2 className="h-4 w-4" />
          Meta · Data Deletion Status
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Trạng thái yêu cầu xóa dữ liệu
        </h1>
        <p className="mt-3 text-muted-foreground">
          Mã xác nhận từ Facebook/Meta. Trang này không yêu cầu đăng nhập.
        </p>

        <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-6 md:p-8">
          <div className="flex items-start gap-4">
            <StatusIcon status={status.status} />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-muted-foreground">Mã xác nhận</p>
              <p className="mt-1 font-mono text-sm sm:text-base break-all text-white">
                {status.confirmation_code}
              </p>
              <p className="mt-4 text-lg font-semibold text-white">{status.status}</p>
              <p className="mt-2 text-sm text-muted-foreground">{status.message}</p>
              {status.facebook_user_id_masked && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Facebook user: {status.facebook_user_id_masked}
                </p>
              )}
              {status.completed_at && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Hoàn tất: {new Date(status.completed_at).toLocaleString('vi-VN')}
                </p>
              )}
              {status.status === 'COMPLETED' && (
                <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
                  <li>Fanpage đã gỡ: {status.pages_removed ?? 0}</li>
                  <li>Bài đã ẩn danh: {status.posts_anonymized ?? 0}</li>
                  <li>Lịch đăng đã hủy: {status.scheduled_cancelled ?? 0}</li>
                </ul>
              )}
            </div>
          </div>
        </div>

        <p className="mt-8 text-sm text-muted-foreground">
          Cần hỗ trợ? Email{' '}
          <a
            className="text-[#F97316] hover:underline"
            href="mailto:thegioimarketingdigi@gmail.com"
          >
            thegioimarketingdigi@gmail.com
          </a>{' '}
          kèm mã xác nhận.
        </p>
      </main>
    </div>
  );
}
