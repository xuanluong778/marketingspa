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
  Clock,
  CreditCard,
  Handshake,
  User,
  BookOpen,
  KeyRound,
  Languages,
  ListTodo,
  BarChart3,
  Mail,
  Sparkles,
  Coins,
  Link2,
  ShoppingCart,
  Package,
  Warehouse,
  ArrowLeftRight,
  ClipboardList,
  type LucideIcon,
} from 'lucide-react';
import { CONTENT_AUTO_POST_BASE } from '@/lib/content-auto-post-routes';

export interface NavItem {
  /** i18n dictionary key (e.g. `nav.overview`) */
  title: string;
  href: string;
  icon: LucideIcon;
}

export interface NavGroup {
  /** i18n dictionary key */
  title: string;
  icon: LucideIcon;
  href?: string;
  items?: NavItem[];
}

export const SETTINGS_TABS = [
  'account',
  'language',
  'knowledge',
  'connections',
  'api',
  'system',
  'assignment',
] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

export const settingsNavItems: NavItem[] = [
  { title: 'nav.settingsAccount', href: '/settings?tab=account', icon: User },
  { title: 'nav.settingsLanguage', href: '/settings?tab=language', icon: Languages },
  { title: 'nav.settingsKnowledge', href: '/settings?tab=knowledge', icon: BookOpen },
  { title: 'nav.settingsConnections', href: '/settings?tab=connections', icon: Link2 },
  { title: 'nav.settingsApi', href: '/settings?tab=api', icon: KeyRound },
  { title: 'nav.settingsSystem', href: '/settings?tab=system', icon: Settings },
  { title: 'nav.settingsAssignment', href: '/settings?tab=assignment', icon: UserPlus },
];

export const mainNav: NavItem[] = [
  { title: 'nav.overview', href: '/overview', icon: LayoutDashboard },
  { title: 'nav.customers', href: '/customers', icon: Users },
  { title: 'nav.leads', href: '/leads', icon: UserPlus },
  { title: 'nav.funnel', href: '/funnel', icon: Filter },
  { title: 'nav.appointments', href: '/appointments', icon: CalendarDays },
  { title: 'nav.ads', href: '/ads', icon: Megaphone },
  { title: 'nav.marketingAutopilot', href: '/marketing-autopilot', icon: Sparkles },
  { title: 'nav.autoMessages', href: '/automation?tab=flows', icon: Bot },
  { title: 'nav.bulkMessaging', href: '/automation?tab=campaigns', icon: Megaphone },
  { title: 'nav.hrm', href: '/hrm/employees', icon: UserCog },
  { title: 'nav.revenuePnl', href: '/finance', icon: TrendingUp },
  { title: 'nav.businessGoals', href: '/business-goals', icon: Target },
  { title: 'nav.chatbotCskh', href: '/chatbot-cskh', icon: MessageCircle },
  { title: 'nav.emailMarketing', href: '/email-marketing', icon: Mail },
  { title: 'nav.contentStudio', href: CONTENT_AUTO_POST_BASE, icon: Layers },
  { title: 'nav.pricing', href: '/pricing', icon: CreditCard },
  { title: 'nav.aiCredit', href: '/credits', icon: Coins },
  { title: 'nav.reports', href: '/reports', icon: FileBarChart },
  { title: 'nav.settings', href: '/settings', icon: Settings },
];

export const sidebarNavGroups: NavGroup[] = [
  { title: 'nav.overview', href: '/overview', icon: LayoutDashboard },
  { title: 'nav.marketingAutopilot', href: '/marketing-autopilot', icon: Sparkles },
  {
    title: 'nav.crmCustomers',
    href: '/crm',
    icon: Users,
    items: [
      { title: 'nav.customers', href: '/customers', icon: Users },
      { title: 'nav.leads', href: '/leads', icon: UserPlus },
      { title: 'nav.funnel', href: '/funnel', icon: Filter },
    ],
  },
  { title: 'nav.appointmentsServices', href: '/appointments', icon: CalendarRange },
  {
    title: 'nav.contentMarketing',
    href: '/content-marketing',
    icon: Layers,
    items: [
      {
        title: 'nav.createContent',
        href: `${CONTENT_AUTO_POST_BASE}?tab=create&section=ad`,
        icon: ChevronRight,
      },
      {
        title: 'nav.brandBuilding',
        href: `${CONTENT_AUTO_POST_BASE}?tab=create&section=personal`,
        icon: ChevronRight,
      },
      {
        title: 'nav.checkContentAds',
        href: `${CONTENT_AUTO_POST_BASE}?tab=create&section=facebook-check`,
        icon: ChevronRight,
      },
      {
        title: 'nav.videoTranscript',
        href: `${CONTENT_AUTO_POST_BASE}?tab=create&section=video-transcript`,
        icon: ChevronRight,
      },
      {
        title: 'nav.contentLibrary',
        href: `${CONTENT_AUTO_POST_BASE}?tab=library`,
        icon: ChevronRight,
      },
      { title: 'nav.autoPost', href: `${CONTENT_AUTO_POST_BASE}?tab=auto-post`, icon: ChevronRight },
      { title: 'nav.schedule', href: `${CONTENT_AUTO_POST_BASE}?tab=schedule`, icon: ChevronRight },
      {
        title: 'nav.connectFanpage',
        href: `${CONTENT_AUTO_POST_BASE}?tab=channels`,
        icon: ChevronRight,
      },
      { title: 'nav.teleprompter', href: '/teleprompter', icon: ChevronRight },
    ],
  },
  {
    title: 'nav.adsGroup',
    href: '/advertising',
    icon: Megaphone,
    items: [
      { title: 'nav.ads', href: '/ads', icon: Megaphone },
      { title: 'nav.attributionRoas', href: '/attribution', icon: FileBarChart },
    ],
  },
  {
    title: 'nav.messagesChatbot',
    href: '/messaging',
    icon: MessageCircle,
    items: [
      { title: 'nav.bulkMessaging', href: '/automation?tab=campaigns', icon: Megaphone },
      { title: 'nav.audienceFiles', href: '/automation?tab=audience', icon: Users },
      { title: 'nav.autoMessages', href: '/automation?tab=flows', icon: Bot },
      { title: 'nav.chatbotCskh', href: '/chatbot-cskh', icon: MessageCircle },
      { title: 'nav.emailMarketing', href: '/email-marketing', icon: Mail },
      { title: 'nav.zaloMarketing', href: '/zalo-marketing', icon: MessageCircle },
    ],
  },
  {
    title: 'nav.hrm',
    href: '/hrm',
    icon: UserCog,
    items: [
      { title: 'nav.employees', href: '/hrm/employees', icon: UserCog },
      { title: 'nav.shifts', href: '/hrm/shifts', icon: Clock },
      { title: 'nav.attendance', href: '/hrm/attendance', icon: CalendarRange },
      { title: 'nav.leaveOt', href: '/hrm/leave', icon: CalendarDays },
      { title: 'nav.workProjects', href: '/work-management', icon: Target },
      { title: 'nav.myWork', href: '/work-management/my', icon: ListTodo },
      { title: 'nav.workDashboard', href: '/work-management/dashboard', icon: BarChart3 },
      { title: 'nav.workCalendar', href: '/work-management/calendar', icon: CalendarDays },
    ],
  },
  {
    title: 'nav.sales',
    href: '/sales',
    icon: ShoppingCart,
    items: [
      { title: 'nav.salesOrders', href: '/sales/orders', icon: ClipboardList },
      { title: 'nav.salesProducts', href: '/sales/products', icon: Package },
      { title: 'nav.salesInventory', href: '/sales/inventory', icon: Warehouse },
      { title: 'nav.salesStockIo', href: '/sales/stock-movements', icon: ArrowLeftRight },
      { title: 'nav.salesStocktake', href: '/sales/stocktake', icon: ClipboardList },
      { title: 'nav.salesPurchases', href: '/sales/purchases', icon: Package },
      { title: 'nav.salesReports', href: '/sales/reports', icon: BarChart3 },
    ],
  },
  {
    title: 'nav.financeBilling',
    href: '/finance-billing',
    icon: Wallet,
    items: [
      { title: 'nav.revenuePnl', href: '/finance', icon: TrendingUp },
      { title: 'nav.businessGoals', href: '/business-goals', icon: Target },
      { title: 'nav.affiliate', href: '/affiliate', icon: Handshake },
      { title: 'nav.aiCredit', href: '/credits', icon: Coins },
    ],
  },
  { title: 'nav.reports', href: '/reports', icon: FileBarChart },
  {
    title: 'nav.settings',
    href: '/settings',
    icon: Settings,
    items: settingsNavItems,
  },
];

export function parseSettingsTab(raw: string | null | undefined): SettingsTab {
  const v = (raw || '').trim().toLowerCase();
  if (v === 'language' || v === 'locale' || v === 'ui-language' || v === 'ngon-ngu') {
    return 'language';
  }
  if (v === 'knowledge' || v === 'knowledge-base' || v === 'kb') return 'knowledge';
  if (v === 'connections' || v === 'connect' || v === 'zalo' || v === 'zalo-oa') {
    return 'connections';
  }
  if (v === 'api' || v === 'integrations') return 'api';
  if (v === 'system' || v === 'general') return 'system';
  if (v === 'assignment' || v === 'sla' || v === 'assign') return 'assignment';
  return 'account';
}

/** Returns an i18n dictionary key for the current pathname. */
export function getPageTitleKey(pathname: string): string {
  if (pathname === '/marketing-autopilot' || pathname.startsWith('/marketing-autopilot/')) {
    return 'nav.marketingAutopilot';
  }
  if (pathname === '/email-marketing' || pathname.startsWith('/email-marketing/')) {
    return 'nav.emailMarketing';
  }
  if (pathname === '/zalo-marketing' || pathname.startsWith('/zalo-marketing/')) {
    return 'nav.zaloMarketing';
  }
  if (pathname === '/messages' || pathname.startsWith('/messages/')) {
    return 'nav.messages';
  }
  if (pathname === '/teleprompter' || pathname.startsWith('/teleprompter/')) {
    return 'nav.teleprompter';
  }
  if (pathname === '/pricing' || pathname.startsWith('/pricing/')) {
    return 'nav.pricing';
  }
  if (pathname === '/credits' || pathname.startsWith('/credits/')) {
    return 'nav.aiCredit';
  }
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return 'nav.admin';
  }
  if (pathname === '/work-management' || pathname.startsWith('/work-management/')) {
    if (pathname.includes('/my')) return 'nav.myWork';
    if (pathname.includes('/dashboard')) return 'nav.workDashboard';
    if (pathname.includes('/calendar')) return 'nav.workCalendar';
    return 'nav.workProjects';
  }
  if (pathname === '/hrm/employees' || pathname.startsWith('/hrm/employees/')) {
    return 'nav.hrm';
  }
  if (pathname === '/hrm/attendance' || pathname.startsWith('/hrm/attendance/')) {
    return 'nav.attendance';
  }
  if (pathname === '/hrm/leave' || pathname.startsWith('/hrm/leave/')) {
    return 'nav.leaveOt';
  }
  if (pathname === '/hrm/shifts' || pathname.startsWith('/hrm/shifts/')) {
    return 'nav.shifts';
  }
  if (pathname === '/knowledge-base' || pathname.startsWith('/knowledge-base/')) {
    return 'nav.settings';
  }
  if (pathname === '/settings' || pathname.startsWith('/settings/')) {
    return 'nav.settings';
  }
  if (pathname === '/sales/orders' || pathname.startsWith('/sales/orders/')) {
    return 'nav.salesOrders';
  }
  if (pathname === '/sales/products' || pathname.startsWith('/sales/products/')) {
    return 'nav.salesProducts';
  }
  if (pathname === '/sales/inventory' || pathname.startsWith('/sales/inventory/')) {
    return 'nav.salesInventory';
  }
  if (pathname === '/sales/stock-movements' || pathname.startsWith('/sales/stock-movements/')) {
    return 'nav.salesStockIo';
  }
  if (pathname === '/sales/stocktake' || pathname.startsWith('/sales/stocktake/')) {
    return 'nav.salesStocktake';
  }
  if (pathname === '/sales/purchases' || pathname.startsWith('/sales/purchases/')) {
    return 'nav.salesPurchases';
  }
  if (pathname === '/sales/reports' || pathname.startsWith('/sales/reports/')) {
    return 'nav.salesReports';
  }
  if (pathname === '/sales' || pathname === '/sales/') {
    return 'nav.sales';
  }
  if (pathname.startsWith('/sales/')) {
    return 'nav.sales';
  }
  if (pathname === '/crm' || pathname.startsWith('/crm/')) {
    return 'nav.crmCustomers';
  }
  if (pathname === '/content-marketing' || pathname.startsWith('/content-marketing/')) {
    return 'nav.contentMarketing';
  }
  if (pathname === '/advertising' || pathname.startsWith('/advertising/')) {
    return 'nav.adsGroup';
  }
  if (pathname === '/messaging' || pathname.startsWith('/messaging/')) {
    return 'nav.messagesChatbot';
  }
  if (pathname === '/hrm' || pathname === '/hrm/') {
    return 'nav.hrm';
  }
  if (pathname === '/finance-billing' || pathname.startsWith('/finance-billing/')) {
    return 'nav.financeBilling';
  }
  if (pathname === '/attribution' || pathname.startsWith('/attribution/')) {
    return 'nav.attributionRoas';
  }
  if (
    pathname === CONTENT_AUTO_POST_BASE ||
    pathname.startsWith(`${CONTENT_AUTO_POST_BASE}/`) ||
    pathname === '/ai' ||
    pathname.startsWith('/ai/') ||
    pathname === '/auto-post' ||
    pathname.startsWith('/auto-post/')
  ) {
    return 'nav.contentStudio';
  }
  const item = mainNav.find((n) => pathname === n.href || pathname.startsWith(`${n.href}/`));
  return item?.title ?? 'common.brandName';
}

/** @deprecated Use `getPageTitleKey` with `t()` instead. */
export function getPageTitle(pathname: string): string {
  return getPageTitleKey(pathname);
}
