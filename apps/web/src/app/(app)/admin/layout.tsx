'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import {
  Activity,
  Building2,
  CreditCard,
  Handshake,
  LayoutDashboard,
  Plug,
  ScrollText,
  Shield,
  Users,
  Workflow,
} from 'lucide-react';
import { useCurrentUser } from '@/hooks/use-auth';
import { LoadingState } from '@/components/shared/page-state';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/admin', label: 'Tổng quan', icon: LayoutDashboard, exact: true },
  { href: '/admin/organizations', label: 'Spa / Tổ chức', icon: Building2 },
  { href: '/admin/users', label: 'Người dùng', icon: Users },
  { href: '/admin/subscriptions', label: 'Gói đăng ký', icon: CreditCard },
  { href: '/admin/billing', label: 'Thanh toán SePay', icon: Shield },
  { href: '/admin/usage', label: 'Mức sử dụng', icon: Activity },
  { href: '/admin/integrations', label: 'Tích hợp', icon: Plug },
  { href: '/admin/jobs', label: 'Công việc nền', icon: Workflow },
  { href: '/admin/audit', label: 'Nhật ký hệ thống', icon: ScrollText },
  { href: '/admin/affiliate', label: 'Affiliate', icon: Handshake },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && user && user.role !== 'SUPER_ADMIN') {
      router.replace('/overview');
    }
  }, [user, isLoading, router]);

  if (isLoading) return <LoadingState />;
  if (!user || user.role !== 'SUPER_ADMIN') {
    return (
      <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-6 text-sm text-red-100">
        Bạn không có quyền truy cập khu vực quản trị nền tảng.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[hsl(var(--heading))]">
            Quản trị MarketingAutoAZ
          </h1>
          <p className="text-xs text-muted-foreground">
            SUPER_ADMIN · thao tác có audit log · yêu cầu lý do · không lộ secret
          </p>
        </div>
      </div>

      <nav className="flex flex-wrap gap-1 rounded-xl border border-white/10 bg-[#0A3D30] p-1.5">
        {NAV.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition sm:text-sm',
                active
                  ? 'bg-white text-[#0A3D30]'
                  : 'text-white/80 hover:bg-white/10 hover:text-white',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="min-h-[40vh]">{children}</div>
    </div>
  );
}
