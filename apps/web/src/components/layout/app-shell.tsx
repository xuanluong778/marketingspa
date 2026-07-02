'use client';

import { useState } from 'react';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { RealtimeProvider } from '@/providers/realtime-provider';
import { RealtimeNotifications } from '@/components/realtime/realtime-notifications';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <RealtimeProvider>
      <div className="flex min-h-screen">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex w-64 flex-col border-r bg-card shrink-0">
          <Sidebar />
        </aside>

        {/* Mobile sidebar */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-64 p-0">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>

        <div className="flex flex-1 flex-col min-w-0">
          <Topbar onMenuClick={() => setMobileOpen(true)} />
          <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
        </div>
      </div>
      <RealtimeNotifications />
    </RealtimeProvider>
  );
}
