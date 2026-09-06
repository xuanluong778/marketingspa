import { CONTENT_AUTO_POST_BASE } from '@/lib/content-auto-post-routes';
import { getPageTitle } from '@/config/navigation';

/** Map canonical Vietnamese nav labels to i18n keys. */
export const NAV_LABEL_KEYS: Record<string, string> = {
  'Marketing Auto AZ': 'common.brandName',
  'Tổng quan': 'nav.overview',
  'Marketing Autopilot': 'nav.marketingAutopilot',
  'CRM & Khách hàng': 'nav.crmCustomers',
  'Khách hàng': 'nav.customers',
  'Lead': 'nav.leads',
  'Phễu Marketing': 'nav.funnel',
  'Lịch hẹn & Dịch vụ': 'nav.appointmentsServices',
  'Lịch hẹn': 'nav.appointments',
  'Content Marketing': 'nav.contentMarketing',
  'Tạo content': 'nav.createContent',
  'Xây dựng thương hiệu': 'nav.brandBuilding',
  'Check Content Ads': 'nav.checkContentAds',
  'Lấy văn bản từ video': 'nav.videoTranscript',
  'Thư viện bài viết': 'nav.contentLibrary',
  'Auto Post': 'nav.autoPost',
  'Lịch đăng': 'nav.schedule',
  'Kết nối Fanpage': 'nav.connectFanpage',
  'Kịch bản quay video': 'nav.teleprompter',
  'Quảng cáo': 'nav.adsGroup',
  'Ads': 'nav.ads',
  'Attribution & ROAS': 'nav.attributionRoas',
  'Tin nhắn & Chatbot': 'nav.messagesChatbot',
  'Nhắn tin hàng loạt': 'nav.bulkMessaging',
  'Tệp khách hàng': 'nav.audienceFiles',
  'Tin nhắn tự động': 'nav.autoMessages',
  'Chatbot CSKH': 'nav.chatbotCskh',
  'Email Marketing': 'nav.emailMarketing',
  'Zalo Marketing': 'nav.zaloMarketing',
  'Quản Lý Nhân Sự': 'nav.hrm',
  'Danh sách nhân viên': 'nav.employees',
  'Ca làm việc': 'nav.shifts',
  'Bảng công': 'nav.attendance',
  'Phép & OT': 'nav.leaveOt',
  'Công việc & Dự án': 'nav.workProjects',
  'Việc của tôi': 'nav.myWork',
  'Dashboard công việc': 'nav.workDashboard',
  'Lịch công việc': 'nav.workCalendar',
  'Bán hàng': 'nav.sales',
  'Đơn hàng': 'nav.salesOrders',
  'Sản phẩm': 'nav.salesProducts',
  'Kho hàng': 'nav.salesInventory',
  'Nhập/Xuất kho': 'nav.salesStockIo',
  'Kiểm kê kho': 'nav.salesStocktake',
  'Nhà cung cấp / PO': 'nav.salesPurchases',
  'Báo cáo bán hàng': 'nav.salesReports',
  'Tài chính Spa': 'nav.financeSpa',
  'Doanh thu & Lãi lỗ': 'nav.revenuePnl',
  'Mục tiêu kinh doanh': 'nav.businessGoals',
  'Affiliate': 'nav.affiliate',
  'AI Credit': 'nav.aiCredit',
  'Báo cáo': 'nav.reports',
  'Cài đặt': 'nav.settings',
  'Ngôn ngữ giao diện': 'nav.settingsLanguage',
  'Account': 'nav.settingsAccount',
  'AI Knowledge Base': 'nav.settingsKnowledge',
  'Kết nối': 'nav.settingsConnections',
  'API': 'nav.settingsApi',
  'System': 'nav.settingsSystem',
  'Phân lead & SLA': 'nav.settingsAssignment',
  'Bảng giá': 'nav.pricing',
  'Content Studio': 'nav.contentStudio',
  'Tin nhắn': 'nav.messages',
  'Quản trị viên': 'nav.admin',
};

const HUB_PATH_KEYS: Record<string, string> = {
  '/crm': 'nav.crmCustomers',
  '/content-marketing': 'nav.contentMarketing',
  '/advertising': 'nav.adsGroup',
  '/messaging': 'nav.messagesChatbot',
  '/hrm': 'nav.hrm',
  '/sales': 'nav.sales',
  '/finance-billing': 'nav.financeSpa',
};

const MODULE_DESC_KEYS: Record<string, string> = {
  'CRM & Khách hàng': 'moduleHub.module.crm',
  'Content Marketing': 'moduleHub.module.content',
  'Quảng cáo': 'moduleHub.module.ads',
  'Tin nhắn & Chatbot': 'moduleHub.module.messaging',
  'Quản Lý Nhân Sự': 'moduleHub.module.hrm',
  'Bán hàng': 'moduleHub.module.sales',
  'Tài chính Spa': 'moduleHub.module.finance',
  'Cài đặt': 'moduleHub.module.settings',
};

const FEATURE_DESC_KEYS: Record<string, string> = {
  'Khách hàng': 'moduleHub.desc.customers',
  'Lead': 'moduleHub.desc.leads',
  'Phễu Marketing': 'moduleHub.desc.funnel',
  'Tạo content': 'moduleHub.desc.createContent',
  'Xây dựng thương hiệu': 'moduleHub.desc.brandBuilding',
  'Check Content Ads': 'moduleHub.desc.checkContentAds',
  'Lấy văn bản từ video': 'moduleHub.desc.videoTranscript',
  'Thư viện bài viết': 'moduleHub.desc.contentLibrary',
  'Auto Post': 'moduleHub.desc.autoPost',
  'Lịch đăng': 'moduleHub.desc.schedule',
  'Kết nối Fanpage': 'moduleHub.desc.connectFanpage',
  'Kịch bản quay video': 'moduleHub.desc.teleprompter',
  'Ads': 'moduleHub.desc.ads',
  'Attribution & ROAS': 'moduleHub.desc.attributionRoas',
  'Nhắn tin hàng loạt': 'moduleHub.desc.bulkMessaging',
  'Tệp khách hàng': 'moduleHub.desc.audienceFiles',
  'Tin nhắn tự động': 'moduleHub.desc.autoMessages',
  'Chatbot CSKH': 'moduleHub.desc.chatbotCskh',
  'Email Marketing': 'moduleHub.desc.emailMarketing',
  'Zalo Marketing': 'moduleHub.desc.zaloMarketing',
  'Danh sách nhân viên': 'moduleHub.desc.employees',
  'Ca làm việc': 'moduleHub.desc.shifts',
  'Bảng công': 'moduleHub.desc.attendance',
  'Phép & OT': 'moduleHub.desc.leaveOt',
  'Công việc & Dự án': 'moduleHub.desc.workProjects',
  'Việc của tôi': 'moduleHub.desc.myWork',
  'Dashboard công việc': 'moduleHub.desc.workDashboard',
  'Lịch công việc': 'moduleHub.desc.workCalendar',
  'Đơn hàng': 'moduleHub.desc.salesOrders',
  'Sản phẩm': 'moduleHub.desc.salesProducts',
  'Kho hàng': 'moduleHub.desc.salesInventory',
  'Nhập/Xuất kho': 'moduleHub.desc.salesStockIo',
  'Kiểm kê kho': 'moduleHub.desc.salesStocktake',
  'Nhà cung cấp / PO': 'moduleHub.desc.salesPurchases',
  'Báo cáo bán hàng': 'moduleHub.desc.salesReports',
  'Doanh thu & Lãi lỗ': 'moduleHub.desc.revenuePnl',
  'Mục tiêu kinh doanh': 'moduleHub.desc.businessGoals',
  'Affiliate': 'moduleHub.desc.affiliate',
  'AI Credit': 'moduleHub.desc.aiCredit',
  'Account': 'moduleHub.desc.settingsAccount',
  'Ngôn ngữ giao diện': 'moduleHub.desc.settingsLanguage',
  'AI Knowledge Base': 'moduleHub.desc.settingsKnowledge',
  'Kết nối': 'moduleHub.desc.settingsConnections',
  'API': 'moduleHub.desc.settingsApi',
  'System': 'moduleHub.desc.settingsSystem',
  'Phân lead & SLA': 'moduleHub.desc.settingsAssignment',
};

export function navLabel(t: (key: string) => string, viTitle: string): string {
  const key = NAV_LABEL_KEYS[viTitle];
  return key ? t(key) : viTitle;
}

export function moduleDescription(t: (key: string) => string, viTitle: string): string {
  const key = MODULE_DESC_KEYS[viTitle];
  return key ? t(key) : `Tổng quan ${navLabel(t, viTitle)}`;
}

export function featureDescription(t: (key: string) => string, viTitle: string): string {
  const key = FEATURE_DESC_KEYS[viTitle];
  return key ? t(key) : `Mở ${navLabel(t, viTitle)}`;
}

export function getTranslatedPageTitle(pathname: string, t: (key: string) => string): string {
  const hubKey = HUB_PATH_KEYS[pathname];
  if (hubKey) return t(hubKey);

  if (
    pathname === CONTENT_AUTO_POST_BASE ||
    pathname.startsWith(`${CONTENT_AUTO_POST_BASE}/`) ||
    pathname === '/ai' ||
    pathname.startsWith('/ai/') ||
    pathname === '/auto-post' ||
    pathname.startsWith('/auto-post/')
  ) {
    return t('nav.contentStudio');
  }

  const viTitle = getPageTitle(pathname);
  return navLabel(t, viTitle);
}
