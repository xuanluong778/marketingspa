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
import { useT } from '@/i18n/i18n-provider';

const NAV = [
  { href: '/admin', labelKey: 'admin.nav.overview', icon: LayoutDashboard, exact: true },
  { href: '/admin/organizations', labelKey: 'admin.nav.organizations', icon: Building2 },
  { href: '/admin/users', labelKey: 'admin.nav.users', icon: Users },
  { href: '/admin/subscriptions', labelKey: 'admin.nav.subscriptions', icon: CreditCard },
  { href: '/admin/billing', labelKey: 'admin.nav.billing', icon: Shield },
  { href: '/admin/usage', labelKey: 'admin.nav.usage', icon: Activity },
  { href: '/admin/integrations', labelKey: 'admin.nav.integrations', icon: Plug },
  { href: '/admin/jobs', labelKey: 'admin.nav.jobs', icon: Workflow },
  { href: '/admin/audit', labelKey: 'admin.nav.audit', icon: ScrollText },
  { href: '/admin/affiliate', labelKey: 'admin.nav.affiliate', icon: Handshake },
] as const;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const t = useT();
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
        {t('admin.noAccess')}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <nav className="flex shrink-0 flex-wrap gap-1 lg:w-56 lg:flex-col">
        {NAV.map(({ href, labelKey, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-primary/10 font-medium text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {t(labelKey)}
            </Link>
          );
        })}
      </nav>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
