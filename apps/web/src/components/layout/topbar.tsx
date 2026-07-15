'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Menu, ChevronRight, LogOut, User } from 'lucide-react';
import { getPageTitle } from '@/config/navigation';
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

interface TopbarProps {
  onMenuClick: () => void;
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const logout = useLogout();

  const initials = user?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-white/10 bg-[#0A3D30] px-4 text-white">
      <Button variant="ghost" size="icon" className="lg:hidden text-white hover:bg-white/10 hover:text-white" onClick={onMenuClick}>
        <Menu className="h-5 w-5" />
      </Button>

      <div className="flex items-center gap-1 text-sm text-white/70 min-w-0">
        <span className="hidden sm:inline">MarketingSpa</span>
        <ChevronRight className="h-4 w-4 hidden sm:inline shrink-0" />
        <span className="font-medium text-[hsl(var(--heading))] truncate">{getPageTitle(pathname)}</span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {user?.organization && (
          <span className="hidden md:inline text-xs text-white/70 truncate max-w-[160px]">
            {user.organization.name}
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-9 w-9 rounded-full text-white hover:bg-white/10 hover:text-white">
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
            <DropdownMenuItem onClick={() => router.push('/settings')}>
              <User className="mr-2 h-4 w-4" />
              Cài đặt
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                logout.mutate(undefined, { onSuccess: () => router.push('/login') });
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Đăng xuất
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
