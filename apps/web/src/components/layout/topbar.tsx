'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Menu, ChevronRight, LogOut, User, Handshake, Shield, Languages } from 'lucide-react';
import { getPageTitleKey } from '@/config/navigation';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCurrentUser, useLogout } from '@/hooks/use-auth';
import { useT } from '@/i18n/i18n-provider';
import { MessagesHeaderIcon } from './messages-header-icon';
import { HeaderCreditChip } from './header-credit-chip';
import { HeaderSubscriptionChips } from './header-subscription-chips';

interface TopbarProps {
  onMenuClick: () => void;
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const logout = useLogout();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const initials = user?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-14 min-w-0 items-center gap-2 overflow-hidden border-b border-white/10 bg-[#0A3D30] px-2 text-white sm:gap-3 sm:px-4">
      <Button
        variant="ghost"
        size="icon"
        className="h-11 w-11 shrink-0 text-white hover:bg-white/10 hover:text-white lg:hidden"
        onClick={onMenuClick}
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-white/70">
        <span className="hidden shrink-0 sm:inline">{t('common.brandName')}</span>
        <ChevronRight className="hidden h-4 w-4 shrink-0 sm:inline" />
        <span className="truncate font-medium text-[hsl(var(--heading))]">
          {t(getPageTitleKey(pathname))}
        </span>
      </div>

      {/* 1 icon tin nhắn (realtime Socket) — góc phải header, trước avatar */}
      <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-2">
        <div className="hidden min-w-0 items-center gap-2 md:flex">
          <HeaderSubscriptionChips />
        </div>
        <HeaderCreditChip />
        <MessagesHeaderIcon tone="dark" />
        {user?.organization && (
          <span className="hidden max-w-[160px] truncate text-xs text-white/70 md:inline">
            {user.organization.name}
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="relative h-11 w-11 rounded-full text-white hover:bg-white/10 hover:text-white"
            >
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                  {initials ?? 'U'}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">{user?.name}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push('/affiliate')}>
              <Handshake className="mr-2 h-4 w-4" />
              {t('nav.affiliate')}
            </DropdownMenuItem>
            {isSuperAdmin && (
              <DropdownMenuItem onClick={() => router.push('/admin')}>
                <Shield className="mr-2 h-4 w-4" />
                {t('nav.admin')}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => router.push('/settings?tab=language')}>
              <Languages className="mr-2 h-4 w-4" />
              {t('settings.tabs.language')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/settings')}>
              <User className="mr-2 h-4 w-4" />
              {t('nav.settings')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                logout.mutate(undefined, { onSuccess: () => router.push('/login') });
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              {t('auth.logout')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
