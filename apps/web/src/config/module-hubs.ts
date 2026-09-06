import type { LucideIcon } from 'lucide-react';
import { sidebarNavGroups, type NavGroup, type NavItem } from '@/config/navigation';

export interface ModuleHubFeature {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
}

export interface ModuleHubDefinition {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  features: ModuleHubFeature[];
}

export type ModuleHubKpi = {
  labelKey: string;
  value: string | number;
  hintKey?: string;
};

/** Hub overview routes keyed by sidebar group title (single source of truth). */
export const MODULE_HUB_HREFS: Record<string, string> = {
  'CRM & Khách hàng': '/crm',
  'Content Marketing': '/content-marketing',
  'Quảng cáo': '/advertising',
  'Tin nhắn & Chatbot': '/messaging',
  'Quản Lý Nhân Sự': '/hrm',
  'Bán hàng': '/sales',
  'Tài chính Spa': '/finance-billing',
  'Cài đặt': '/settings?tab=overview',
};

const MODULE_DESCRIPTIONS: Record<string, string> = {
  'CRM & Khách hàng': 'Quản lý khách hàng, lead và phễu chuyển đổi',
  'Content Marketing': 'Tạo content, đăng bài, teleprompter và kết nối kênh',
  'Quảng cáo': 'Quảng cáo và đo lường Attribution / ROAS',
  'Tin nhắn & Chatbot': 'Nhắn tin hàng loạt, chatbot, email và Zalo',
  'Quản Lý Nhân Sự': 'Nhân sự, chấm công và quản lý công việc',
  'Bán hàng': 'Đơn hàng, sản phẩm, kho và báo cáo bán hàng',
  'Tài chính Spa': 'Doanh thu, mục tiêu, affiliate và AI Credit',
  'Cài đặt': 'Tài khoản, ngôn ngữ, kết nối, API và cấu hình hệ thống',
};

const FEATURE_DESCRIPTIONS: Record<string, string> = {
  'Khách hàng': 'Hồ sơ khách hàng và lịch sử mua',
  Lead: 'Lead mới, phân công và follow-up',
  'Phễu Marketing': 'Phễu marketing và tối ưu chuyển đổi',
  'Tạo content': 'Tạo nội dung quảng cáo / bài đăng',
  'Xây dựng thương hiệu': 'Xây dựng thương hiệu cá nhân',
  'Check Content Ads': 'Kiểm tra nội dung ads trước khi đăng',
  'Lấy văn bản từ video': 'Lấy văn bản từ video',
  'Thư viện bài viết': 'Thư viện bài viết đã tạo',
  'Auto Post': 'Tự động đăng lên mạng xã hội',
  'Lịch đăng': 'Lịch đăng bài',
  'Kết nối Fanpage': 'Kết nối Facebook Pages / kênh',
  'Kịch bản quay video': 'Kịch bản quay video',
  Ads: 'Quản lý chiến dịch quảng cáo',
  'Attribution & ROAS': 'Attribution và ROAS',
  'Nhắn tin hàng loạt': 'Gửi tin nhắn hàng loạt',
  'Tệp khách hàng': 'Tệp audience / khách hàng',
  'Tin nhắn tự động': 'Luồng tin nhắn tự động',
  'Chatbot CSKH': 'Chatbot chăm sóc khách hàng',
  'Email Marketing': 'Chiến dịch email marketing',
  'Zalo Marketing': 'Marketing trên Zalo',
  'Danh sách nhân viên': 'Danh sách và hồ sơ nhân viên',
  'Ca làm việc': 'Ca làm việc và phân ca',
  'Bảng công': 'Chấm công và bảng công',
  'Phép & OT': 'Nghỉ phép và làm thêm giờ',
  'Công việc & Dự án': 'Quản lý công việc và dự án',
  'Việc của tôi': 'Việc được giao cho bạn',
  'Dashboard công việc': 'Dashboard công việc',
  'Lịch công việc': 'Lịch công việc',
  'Đơn hàng': 'Tạo và xử lý đơn hàng',
  'Sản phẩm': 'Danh mục sản phẩm / SKU',
  'Kho hàng': 'Tồn kho và cảnh báo hạn',
  'Nhập/Xuất kho': 'Nhập xuất điều chỉnh kho',
  'Kiểm kê kho': 'Kiểm kê và đối soát tồn',
  'Nhà cung cấp / PO': 'Nhà cung cấp và đơn mua',
  'Báo cáo bán hàng': 'Báo cáo doanh thu và tồn',
  'Doanh thu & Lãi lỗ': 'Doanh thu và lãi lỗ',
  'Mục tiêu kinh doanh': 'Mục tiêu kinh doanh',
  Affiliate: 'Chương trình affiliate',
  'AI Credit': 'Số dư AI Credit',
  Account: 'Thông tin tài khoản đăng nhập',
  'Ngôn ngữ giao diện': 'Chuyển đổi giao diện VI / EN',
  'AI Knowledge Base': 'Kho kiến thức cho AI',
  'Kết nối': 'Kết nối kênh marketing',
  API: 'API và tích hợp',
  System: 'Cấu hình hệ thống tổ chức',
  'Phân lead & SLA': 'Phân lead và SLA',
};

const HUB_ID_ALIASES: Record<string, string> = {
  crmCustomers: 'CRM & Khách hàng',
  crm: 'CRM & Khách hàng',
  contentMarketing: 'Content Marketing',
  adsGroup: 'Quảng cáo',
  advertising: 'Quảng cáo',
  messagesChatbot: 'Tin nhắn & Chatbot',
  messaging: 'Tin nhắn & Chatbot',
  hrm: 'Quản Lý Nhân Sự',
  sales: 'Bán hàng',
  financeBilling: 'Tài chính Spa',
  settings: 'Cài đặt',
};

function featureFromNavItem(item: NavItem): ModuleHubFeature {
  return {
    title: item.title,
    description: FEATURE_DESCRIPTIONS[item.title] ?? `Mở ${item.title}`,
    href: item.href,
    icon: item.icon,
  };
}

function definitionFromGroup(group: NavGroup): ModuleHubDefinition | null {
  const items = group.items?.length ? group.items : [];
  if (!items.length) return null;

  const href = MODULE_HUB_HREFS[group.title];
  if (!href) return null;

  return {
    id: group.title,
    title: group.title,
    description: MODULE_DESCRIPTIONS[group.title] ?? `Tổng quan ${group.title}`,
    href,
    icon: group.icon,
    features: items.map(featureFromNavItem),
  };
}

export const moduleHubs: ModuleHubDefinition[] = sidebarNavGroups
  .map(definitionFromGroup)
  .filter((d): d is ModuleHubDefinition => Boolean(d));

export function getModuleHubHref(groupTitle: string): string | undefined {
  return MODULE_HUB_HREFS[groupTitle];
}

export function getModuleHubByHref(pathname: string, search = ''): ModuleHubDefinition | undefined {
  const full = `${pathname}${search}`;
  const exact = moduleHubs.find((h) => h.href === full || h.href === pathname);
  if (exact) return exact;

  if (pathname === '/settings' && search.includes('tab=overview')) {
    return moduleHubs.find((h) => h.title === 'Cài đặt');
  }

  return moduleHubs.find(
    (h) => !h.href.includes('?') && (pathname === h.href || pathname.startsWith(`${h.href}/`)),
  );
}

export function getModuleHubById(id: string): ModuleHubDefinition | undefined {
  const title = HUB_ID_ALIASES[id] ?? id;
  return moduleHubs.find((h) => h.id === title || h.title === title);
}

export function isModuleHubPath(pathname: string, search = ''): boolean {
  return Boolean(getModuleHubByHref(pathname, search));
}
