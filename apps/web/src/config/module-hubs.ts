import type { LucideIcon } from 'lucide-react';
import { sidebarNavGroups, type NavGroup, type NavItem } from '@/config/navigation';

/** Feature card on a Module Hub page */
export interface ModuleHubFeature {
  /** i18n key for title (usually nav.*) */
  titleKey: string;
  /** i18n key for short description */
  descriptionKey: string;
  href: string;
  icon: LucideIcon;
}

export interface ModuleHubDefinition {
  /** Stable id matching nav group title key suffix */
  id: string;
  /** i18n key — module name */
  titleKey: string;
  /** i18n key — module short description */
  descriptionKey: string;
  /** Hub overview route */
  href: string;
  icon: LucideIcon;
  features: ModuleHubFeature[];
  /** Optional primary CTA */
  primaryAction?: { labelKey: string; href: string };
}

/** Description keys for each nav child — hub cards */
const FEATURE_DESC: Record<string, string> = {
  'nav.customers': 'moduleHub.desc.customers',
  'nav.leads': 'moduleHub.desc.leads',
  'nav.funnel': 'moduleHub.desc.funnel',
  'nav.createContent': 'moduleHub.desc.createContent',
  'nav.brandBuilding': 'moduleHub.desc.brandBuilding',
  'nav.checkContentAds': 'moduleHub.desc.checkContentAds',
  'nav.videoTranscript': 'moduleHub.desc.videoTranscript',
  'nav.contentLibrary': 'moduleHub.desc.contentLibrary',
  'nav.autoPost': 'moduleHub.desc.autoPost',
  'nav.schedule': 'moduleHub.desc.schedule',
  'nav.connectFanpage': 'moduleHub.desc.connectFanpage',
  'nav.teleprompter': 'moduleHub.desc.teleprompter',
  'nav.ads': 'moduleHub.desc.ads',
  'nav.attributionRoas': 'moduleHub.desc.attributionRoas',
  'nav.bulkMessaging': 'moduleHub.desc.bulkMessaging',
  'nav.audienceFiles': 'moduleHub.desc.audienceFiles',
  'nav.autoMessages': 'moduleHub.desc.autoMessages',
  'nav.chatbotCskh': 'moduleHub.desc.chatbotCskh',
  'nav.emailMarketing': 'moduleHub.desc.emailMarketing',
  'nav.zaloMarketing': 'moduleHub.desc.zaloMarketing',
  'nav.employees': 'moduleHub.desc.employees',
  'nav.shifts': 'moduleHub.desc.shifts',
  'nav.attendance': 'moduleHub.desc.attendance',
  'nav.leaveOt': 'moduleHub.desc.leaveOt',
  'nav.workProjects': 'moduleHub.desc.workProjects',
  'nav.myWork': 'moduleHub.desc.myWork',
  'nav.workDashboard': 'moduleHub.desc.workDashboard',
  'nav.workCalendar': 'moduleHub.desc.workCalendar',
  'nav.salesOrders': 'moduleHub.desc.salesOrders',
  'nav.salesProducts': 'moduleHub.desc.salesProducts',
  'nav.salesInventory': 'moduleHub.desc.salesInventory',
  'nav.salesStockIo': 'moduleHub.desc.salesStockIo',
  'nav.salesStocktake': 'moduleHub.desc.salesStocktake',
  'nav.salesPurchases': 'moduleHub.desc.salesPurchases',
  'nav.salesReports': 'moduleHub.desc.salesReports',
  'nav.revenuePnl': 'moduleHub.desc.revenuePnl',
  'nav.businessGoals': 'moduleHub.desc.businessGoals',
  'nav.affiliate': 'moduleHub.desc.affiliate',
  'nav.aiCredit': 'moduleHub.desc.aiCredit',
  'nav.settingsAccount': 'moduleHub.desc.settingsAccount',
  'nav.settingsLanguage': 'moduleHub.desc.settingsLanguage',
  'nav.settingsKnowledge': 'moduleHub.desc.settingsKnowledge',
  'nav.settingsConnections': 'moduleHub.desc.settingsConnections',
  'nav.settingsApi': 'moduleHub.desc.settingsApi',
  'nav.settingsSystem': 'moduleHub.desc.settingsSystem',
  'nav.settingsAssignment': 'moduleHub.desc.settingsAssignment',
  'nav.appointments': 'moduleHub.desc.appointments',
  'nav.reports': 'moduleHub.desc.reports',
};

const MODULE_DESC: Record<string, string> = {
  'nav.crmCustomers': 'moduleHub.module.crm',
  'nav.contentMarketing': 'moduleHub.module.content',
  'nav.adsGroup': 'moduleHub.module.ads',
  'nav.messagesChatbot': 'moduleHub.module.messaging',
  'nav.hrm': 'moduleHub.module.hrm',
  'nav.sales': 'moduleHub.module.sales',
  'nav.financeBilling': 'moduleHub.module.finance',
  'nav.settings': 'moduleHub.module.settings',
  'nav.appointmentsServices': 'moduleHub.module.appointments',
  'nav.reports': 'moduleHub.module.reports',
};

/** Hub overview paths for groups that previously had no root href */
export const MODULE_HUB_HREFS: Record<string, string> = {
  'nav.crmCustomers': '/crm',
  'nav.contentMarketing': '/content-marketing',
  'nav.adsGroup': '/advertising',
  'nav.messagesChatbot': '/messaging',
  'nav.hrm': '/hrm',
  'nav.sales': '/sales',
  'nav.financeBilling': '/finance-billing',
  'nav.settings': '/settings',
  'nav.appointmentsServices': '/appointments',
  'nav.reports': '/reports',
};

function featureFromNavItem(item: NavItem): ModuleHubFeature {
  return {
    titleKey: item.title,
    descriptionKey: FEATURE_DESC[item.title] ?? 'moduleHub.desc.generic',
    href: item.href,
    icon: item.icon,
  };
}

function definitionFromGroup(group: NavGroup): ModuleHubDefinition | null {
  const items = group.items?.length
    ? group.items
    : group.href
      ? [{ title: group.title, href: group.href, icon: group.icon }]
      : [];
  if (!items.length) return null;

  const href = MODULE_HUB_HREFS[group.title] ?? group.href;
  if (!href) return null;

  // Leaf modules without submenu: only expose hub if we map a dedicated hub path
  // that differs from a complex child tool — appointments/reports stay self-hubs.
  const features = (group.items?.length ? group.items : items).map(featureFromNavItem);

  return {
    id: group.title.replace(/^nav\./, ''),
    titleKey: group.title,
    descriptionKey: MODULE_DESC[group.title] ?? 'moduleHub.module.generic',
    href,
    icon: group.icon,
    features,
    primaryAction: features[0]
      ? { labelKey: 'moduleHub.openFirst', href: features[0].href }
      : undefined,
  };
}

/** All module hubs derived from sidebar config (single source of truth). */
export const moduleHubs: ModuleHubDefinition[] = sidebarNavGroups
  .map(definitionFromGroup)
  .filter((d): d is ModuleHubDefinition => Boolean(d && d.features.length > 0));

export function getModuleHubByHref(pathname: string): ModuleHubDefinition | undefined {
  const exact = moduleHubs.find((h) => h.href === pathname);
  if (exact) return exact;
  return moduleHubs.find(
    (h) => pathname === h.href || pathname.startsWith(`${h.href}/`),
  );
}

export function getModuleHubById(id: string): ModuleHubDefinition | undefined {
  return moduleHubs.find((h) => h.id === id || h.titleKey === id || h.titleKey === `nav.${id}`);
}

export type ModuleHubKpi = {
  labelKey: string;
  value: string | number;
  hintKey?: string;
};
