'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronDown, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { sidebarNavGroups, type NavGroup, type NavItem } from '@/config/navigation';
import { CONTENT_AUTO_POST_BASE } from '@/lib/content-auto-post-routes';
import { ScrollArea } from '@/components/ui/scroll-area';

/** Canonicalize create-section for active match (`ads-check` → `facebook-check`). */
function normalizeContentSection(section: string | null | undefined): string {
  const value = (section || 'ad').trim();
  if (value === 'ads-check') return 'facebook-check';
  return value || 'ad';
}

/** Sections that keep outer Content Studio tab `create` active. */
const CREATE_TAB_SECTIONS = new Set([
  'ad',
  'advanced',
  'personal',
  'facebook-check',
  'ads-check',
  'video-transcript',
]);

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentPathWithQuery = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;

  const isNavItemActive = useMemo(
    () => (item: NavItem) => {
      if (!item.href) return false;

      try {
        const want = new URL(item.href, 'http://local');
        const have = new URL(currentPathWithQuery, 'http://local');

        if (item.href.startsWith(`${CONTENT_AUTO_POST_BASE}?`)) {
          // Match by tab (+ section when present) so active state is stable.
          if (have.pathname !== CONTENT_AUTO_POST_BASE) return false;
          const wantTab = want.searchParams.get('tab');
          const haveTab = have.searchParams.get('tab') || 'create';
          if (wantTab !== haveTab) return false;
          const wantSection = want.searchParams.get('section');
          if (wantSection) {
            return (
              normalizeContentSection(have.searchParams.get('section')) ===
              normalizeContentSection(wantSection)
            );
          }
          // Tab-only links (library / auto-post / …): active when tab matches.
          return true;
        }

        // /automation?tab=* — match by pathname + tab query
        if (want.pathname === '/automation' && want.searchParams.has('tab')) {
          if (have.pathname !== '/automation') return false;
          const wantTab = want.searchParams.get('tab');
          const haveTab = have.searchParams.get('tab') || 'campaigns';
          // Tin nhắn tự động (flows): cũng sáng khi đang ở templates/logs/channels
          if (wantTab === 'flows') {
            return (
              haveTab === 'flows' ||
              haveTab === 'templates' ||
              haveTab === 'logs' ||
              haveTab === 'channels'
            );
          }
          return wantTab === haveTab;
        }

        // Legacy /automation không có tab
        if (want.pathname === '/automation' && !want.search) {
          if (have.pathname !== '/automation') return false;
          const haveTab = have.searchParams.get('tab') || 'campaigns';
          return (
            haveTab === 'flows' ||
            haveTab === 'templates' ||
            haveTab === 'logs' ||
            haveTab === 'channels'
          );
        }

        // Other links that include a query string
        if (want.search) {
          if (have.pathname !== want.pathname) return false;
          // Settings: bare /settings defaults to account
          if (want.pathname === '/settings' && want.searchParams.get('tab') === 'account') {
            const haveTab = have.searchParams.get('tab');
            return !haveTab || haveTab === 'account' || haveTab === 'general';
          }
          for (const [key, value] of want.searchParams.entries()) {
            if (key === 'tab' && want.pathname === '/settings') {
              const haveTab = have.searchParams.get('tab');
              // Aliases legacy tabs
              if (value === 'knowledge') {
                return haveTab === 'knowledge' || haveTab === 'knowledge-base' || haveTab === 'kb';
              }
              if (value === 'api') {
                return haveTab === 'api' || haveTab === 'integrations';
              }
              if (value === 'system') {
                return haveTab === 'system' || haveTab === 'general';
              }
            }
            if (have.searchParams.get(key) !== value) return false;
          }
          return true;
        }
      } catch {
        return currentPathWithQuery === item.href;
      }

      return (
        pathname === item.href ||
        pathname.startsWith(`${item.href}/`) ||
        (item.href === CONTENT_AUTO_POST_BASE &&
          (pathname === '/ai' ||
            pathname.startsWith('/ai/') ||
            pathname === '/auto-post' ||
            pathname.startsWith('/auto-post/')))
      );
    },
    [currentPathWithQuery, pathname],
  );

  const isGroupActive = useMemo(
    () => (group: NavGroup) => {
      if (group.items?.some(isNavItemActive)) return true;
      if (!group.href) return false;
      // Settings: active for any /settings tab
      if (group.href === '/settings') {
        return pathname === '/settings' || pathname.startsWith('/settings/');
      }
      if (group.href === CONTENT_AUTO_POST_BASE) {
        // Keep Content Marketing open/active for create-tab sections and teleprompter.
        if (pathname === '/teleprompter' || pathname.startsWith('/teleprompter/')) return true;
        if (
          pathname === CONTENT_AUTO_POST_BASE ||
          pathname.startsWith(`${CONTENT_AUTO_POST_BASE}/`)
        ) {
          const tab = searchParams.get('tab') || 'create';
          if (tab === 'create') {
            const section = searchParams.get('section') || 'ad';
            if (CREATE_TAB_SECTIONS.has(section)) return true;
          }
          return true;
        }
        return (
          pathname === '/ai' ||
          pathname.startsWith('/ai/') ||
          pathname === '/auto-post' ||
          pathname.startsWith('/auto-post/')
        );
      }
      return pathname === group.href || pathname.startsWith(`${group.href}/`);
    },
    [isNavItemActive, pathname, searchParams],
  );

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setOpenGroups((prev) => {
      const next = { ...prev };
      for (const group of sidebarNavGroups) {
        if (group.items?.length && next[group.title] == null) {
          next[group.title] = isGroupActive(group);
        }
        if (group.items?.length && isGroupActive(group)) {
          next[group.title] = true;
        }
      }
      return next;
    });
  }, [isGroupActive]);

  const toggleGroup = (title: string) => {
    setOpenGroups((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  return (
    <div className="flex h-full min-h-0 flex-col text-white">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-white/10 px-4 pr-12">
        <Sparkles className="h-6 w-6 text-white" />
        <span className="font-bold text-lg text-white">MarketingSpa</span>
      </div>
      <ScrollArea className="min-h-0 flex-1 py-4">
        <nav className="grid gap-2 px-2 pb-4">
          {sidebarNavGroups.map((group) => {
            const active = isGroupActive(group);
            const hasChildren = Boolean(group.items?.length);

            if (hasChildren && group.items?.length === 1) {
              const onlyItem = group.items[0]!;
              const itemActive = isNavItemActive(onlyItem);
              return (
                <Link
                  key={group.title}
                  href={onlyItem.href}
                  onClick={onNavigate}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors touch-manipulation',
                    itemActive
                      ? 'bg-white text-[#0A3D30] shadow-sm'
                      : 'text-white/70 hover:bg-white/10 hover:text-white',
                  )}
                >
                  <group.icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{group.title}</span>
                </Link>
              );
            }

            if (!hasChildren && group.href) {
              return (
                <Link
                  key={group.title}
                  href={group.href}
                  onClick={onNavigate}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors touch-manipulation',
                    active
                      ? 'bg-white text-[#0A3D30] shadow-sm'
                      : 'text-white/70 hover:bg-white/10 hover:text-white',
                  )}
                >
                  <group.icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{group.title}</span>
                </Link>
              );
            }

            return (
              <div
                key={group.title}
                className="rounded-xl border border-transparent bg-transparent"
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(group.title)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors touch-manipulation',
                    active
                      ? 'bg-white/15 text-white'
                      : 'text-white/70 hover:bg-white/10 hover:text-white',
                  )}
                >
                  <group.icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{group.title}</span>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 shrink-0 transition-transform',
                      openGroups[group.title] ? 'rotate-180' : '',
                    )}
                  />
                </button>
                {openGroups[group.title] ? (
                  <div className="mt-1 ml-3 space-y-1 border-l border-white/15 pl-3">
                    {group.items?.map((item) => {
                      const itemActive = isNavItemActive(item);
                      return (
                        <Link
                          key={`${group.title}-${item.title}`}
                          href={item.href}
                          onClick={onNavigate}
                          className={cn(
                            'flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition-colors touch-manipulation',
                            itemActive
                              ? 'bg-white text-[#0A3D30] shadow-sm'
                              : 'text-white/65 hover:bg-white/10 hover:text-white',
                          )}
                        >
                          <item.icon className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{item.title}</span>
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
      </ScrollArea>
    </div>
  );
}
