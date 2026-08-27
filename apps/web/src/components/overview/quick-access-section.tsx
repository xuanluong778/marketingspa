'use client';

import Link from 'next/link';
import {
  ArrowRight,
  Filter,
  Layers,
  Mail,
  Megaphone,
  MessageCircle,
  Send,
  Sparkles,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { buildContentAutoPostHref } from '@/lib/content-auto-post-routes';

type QuickAccessBadge = 'hot' | 'new';

type QuickAccessItem = {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  badge?: QuickAccessBadge;
  iconClassName?: string;
};

const QUICK_ACCESS_ITEMS: QuickAccessItem[] = [
  {
    title: 'Content AI',
    description: 'Tạo nội dung quảng cáo, thương hiệu và video bằng AI',
    href: buildContentAutoPostHref('create', { section: 'ad' }),
    icon: Sparkles,
    badge: 'hot',
    iconClassName: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  },
  {
    title: 'Email Marketing',
    description: 'Chiến dịch email, mẫu sẵn và tự động hóa CRM',
    href: '/email-marketing',
    icon: Mail,
    badge: 'new',
    iconClassName: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  },
  {
    title: 'Chatbot CSKH',
    description: 'Hộp thư đa kênh, trả lời tự động và handover nhân viên',
    href: '/chatbot-cskh',
    icon: MessageCircle,
    iconClassName: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  },
  {
    title: 'Gửi tin hàng loạt',
    description: 'Campaign Messenger, Zalo — segment, preview và lên lịch',
    href: '/automation?tab=campaigns',
    icon: Send,
    iconClassName: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  },
  {
    title: 'Phễu Marketing',
    description: 'Thiết kế phễu, landing và theo dõi chuyển đổi',
    href: '/funnel',
    icon: Filter,
    iconClassName: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
  },
  {
    title: 'CRM / Lead',
    description: 'Quản lý lead, pipeline và gán nhân viên xử lý',
    href: '/leads',
    icon: UserPlus,
    iconClassName: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  },
  {
    title: 'Đăng bài Fanpage',
    description: 'Auto Post Facebook — lên lịch và đăng bài tự động',
    href: buildContentAutoPostHref('auto-post'),
    icon: Layers,
    iconClassName: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  },
  {
    title: 'Quảng cáo',
    description: 'Meta, Google, TikTok — chi phí, ROAS và tối ưu',
    href: '/ads',
    icon: Megaphone,
    badge: 'hot',
    iconClassName: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  },
];

function BadgeLabel({ type }: { type: QuickAccessBadge }) {
  if (type === 'hot') {
    return (
      <Badge className="border-0 bg-gradient-to-r from-orange-500 to-rose-500 px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide text-white">
        HOT
      </Badge>
    );
  }
  return (
    <Badge className="border-0 bg-primary px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
      Mới
    </Badge>
  );
}

function QuickAccessCard({ item }: { item: QuickAccessItem }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        'group relative flex h-full flex-col rounded-lg border bg-card p-4 shadow-sm transition-all',
        'hover:border-primary/40 hover:bg-accent/30 hover:shadow-md',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
            item.iconClassName,
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        {item.badge ? <BadgeLabel type={item.badge} /> : null}
      </div>
      <h3 className="text-sm font-semibold leading-snug text-[hsl(var(--heading))] group-hover:text-primary">
        {item.title}
      </h3>
      <p className="mt-1 flex-1 text-xs leading-relaxed text-muted-foreground">
        {item.description}
      </p>
      <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">
        Mở ngay
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

export function OverviewQuickAccessSection() {
  return (
    <section aria-labelledby="quick-access-heading" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2
            id="quick-access-heading"
            className="text-lg font-semibold tracking-tight text-[hsl(var(--heading))]"
          >
            Truy cập nhanh
          </h2>
          <p className="text-sm text-muted-foreground">
            8 tính năng chính — một cú nhấp để bắt đầu
          </p>
        </div>
      </div>
      <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {QUICK_ACCESS_ITEMS.map((item) => (
          <QuickAccessCard key={item.href + item.title} item={item} />
        ))}
      </div>
    </section>
  );
}
