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
  FileBarChart,
  Settings,
  Layers,
  Wallet,
  CalendarRange,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { CONTENT_AUTO_POST_BASE } from '@/lib/content-auto-post-routes';

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
}

export interface NavGroup {
  title: string;
  icon: LucideIcon;
  href?: string;
  items?: NavItem[];
}

export const mainNav: NavItem[] = [
  { title: 'Tổng quan', href: '/overview', icon: LayoutDashboard },
  { title: 'Khách hàng', href: '/customers', icon: Users },
  { title: 'Lead', href: '/leads', icon: UserPlus },
  { title: 'Phễu Marketing', href: '/funnel', icon: Filter },
  { title: 'Lịch hẹn', href: '/appointments', icon: CalendarDays },
  { title: 'AI Ads Manager', href: '/ads', icon: Megaphone },
  { title: 'Tin nhắn tự động', href: '/automation', icon: Bot },
  { title: 'Quản Lý Nhân Sự', href: '/hrm/employees', icon: UserCog },
  { title: 'Doanh thu & Lãi lỗ', href: '/finance', icon: TrendingUp },
  { title: 'Mục tiêu kinh doanh', href: '/business-goals', icon: Target },
  { title: 'Chatbot CSKH', href: '/chatbot-cskh', icon: MessageCircle },
  { title: 'Content & Auto post', href: CONTENT_AUTO_POST_BASE, icon: Layers },
  { title: 'Báo cáo', href: '/reports', icon: FileBarChart },
  { title: 'Cài đặt', href: '/settings', icon: Settings },
];

export const sidebarNavGroups: NavGroup[] = [
  { title: 'Tổng quan', href: '/overview', icon: LayoutDashboard },
  {
    title: 'CRM & Khách hàng',
    icon: Users,
    items: [
      { title: 'Khách hàng', href: '/customers', icon: Users },
      { title: 'Lead', href: '/leads', icon: UserPlus },
      { title: 'Phễu Marketing', href: '/funnel', icon: Filter },
    ],
  },
  { title: 'Lịch hẹn & Dịch vụ', href: '/appointments', icon: CalendarRange },
  {
    title: 'Content Marketing',
    href: CONTENT_AUTO_POST_BASE,
    icon: Layers,
    items: [
      {
        title: 'Tạo content',
        href: `${CONTENT_AUTO_POST_BASE}?tab=create&section=ad`,
        icon: ChevronRight,
      },
      {
        title: 'Xây dựng thương hiệu',
        href: `${CONTENT_AUTO_POST_BASE}?tab=create&section=personal`,
        icon: ChevronRight,
      },
      { title: 'Thư viện bài viết', href: `${CONTENT_AUTO_POST_BASE}?tab=library`, icon: ChevronRight },
      { title: 'Auto Post', href: `${CONTENT_AUTO_POST_BASE}?tab=auto-post`, icon: ChevronRight },
      { title: 'Lịch đăng', href: `${CONTENT_AUTO_POST_BASE}?tab=schedule`, icon: ChevronRight },
      { title: 'Kết nối Fanpage', href: `${CONTENT_AUTO_POST_BASE}?tab=channels`, icon: ChevronRight },
    ],
  },
  {
    title: 'Quảng cáo',
    icon: Megaphone,
    items: [{ title: 'AI Ads Manager', href: '/ads', icon: Megaphone }],
  },
  {
    title: 'Tin nhắn & Chatbot',
    icon: MessageCircle,
    items: [
      { title: 'Tin nhắn tự động', href: '/automation', icon: Bot },
      { title: 'Chatbot CSKH', href: '/chatbot-cskh', icon: MessageCircle },
    ],
  },
  {
    title: 'Quản Lý Nhân Sự',
    icon: UserCog,
    items: [
      { title: 'Danh sách nhân viên', href: '/hrm/employees', icon: UserCog },
      { title: 'Bảng công', href: '/hrm/attendance', icon: CalendarRange },
      { title: 'Phép & OT', href: '/hrm/leave', icon: CalendarDays },
    ],
  },
  {
    title: 'Tài chính Spa',
    icon: Wallet,
    items: [
      { title: 'Doanh thu & Lãi lỗ', href: '/finance', icon: TrendingUp },
      { title: 'Mục tiêu kinh doanh', href: '/business-goals', icon: Target },
    ],
  },
  { title: 'Báo cáo', href: '/reports', icon: FileBarChart },
  { title: 'Cài đặt', href: '/settings', icon: Settings },
];

export function getPageTitle(pathname: string): string {
  if (pathname === '/hrm/employees' || pathname.startsWith('/hrm/employees/')) {
    return 'Quản Lý Nhân Sự';
  }
  if (pathname === '/hrm/attendance' || pathname.startsWith('/hrm/attendance/')) {
    return 'Bảng công';
  }
  if (pathname === '/hrm/leave' || pathname.startsWith('/hrm/leave/')) {
    return 'Phép & OT';
  }
  if (
    pathname === CONTENT_AUTO_POST_BASE ||
    pathname.startsWith(`${CONTENT_AUTO_POST_BASE}/`) ||
    pathname === '/ai' ||
    pathname.startsWith('/ai/') ||
    pathname === '/auto-post' ||
    pathname.startsWith('/auto-post/')
  ) {
    return 'Content & Auto post';
  }
  const item = mainNav.find((n) => pathname === n.href || pathname.startsWith(`${n.href}/`));
  return item?.title ?? 'MarketingSpa';
}
