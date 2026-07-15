'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronDown, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { sidebarNavGroups, type NavGroup, type NavItem } from '@/config/navigation';
import { CONTENT_AUTO_POST_BASE } from '@/lib/content-auto-post-routes';
import { ScrollArea } from '@/components/ui/scroll-area';

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
      if (item.href.startsWith(`${CONTENT_AUTO_POST_BASE}?`)) {
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
      return (
        pathname === group.href ||
        pathname.startsWith(`${group.href}/`) ||
        (group.href === CONTENT_AUTO_POST_BASE &&
          (pathname === '/ai' ||
            pathname.startsWith('/ai/') ||
            pathname === '/auto-post' ||
            pathname.startsWith('/auto-post/')))
      );
    },
    [isNavItemActive, pathname],
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
              const onlyItem = group.items[0];
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
              <div key={group.title} className="rounded-xl border border-transparent bg-transparent">
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
