import {
  LayoutDashboard,
  Users,
  UserPlus,
  Filter,
  CalendarDays,
  Megaphone,
  Bot,
  UserCog,
  TrendingUp,
  MessageCircle,
  Target,
  Sparkles,
  FileBarChart,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
}

export const mainNav: NavItem[] = [
  { title: 'Tổng quan', href: '/overview', icon: LayoutDashboard },
  { title: 'Khách hàng', href: '/customers', icon: Users },
  { title: 'Lead', href: '/leads', icon: UserPlus },
  { title: 'Phễu Marketing', href: '/funnel', icon: Filter },
  { title: 'Lịch hẹn', href: '/appointments', icon: CalendarDays },
  { title: 'Chiến dịch Ads', href: '/ads', icon: Megaphone },
  { title: 'Tin nhắn tự động', href: '/automation', icon: Bot },
  { title: 'Nhân viên', href: '/employees', icon: UserCog },
  { title: 'Doanh thu & Lãi lỗ', href: '/finance', icon: TrendingUp },
  { title: 'Mục tiêu kinh doanh', href: '/business-goals', icon: Target },
  { title: 'Chatbot CSKH', href: '/chatbot-cskh', icon: MessageCircle },
  { title: 'AI Marketing', href: '/ai', icon: Sparkles },
  { title: 'Báo cáo', href: '/reports', icon: FileBarChart },
  { title: 'Cài đặt', href: '/settings', icon: Settings },
];

export function getPageTitle(pathname: string): string {
  const item = mainNav.find((n) => pathname === n.href || pathname.startsWith(`${n.href}/`));
  return item?.title ?? 'MarketingSpa';
}
