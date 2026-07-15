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
      <div className="flex min-h-screen h-screen overflow-hidden">
        {/* Desktop sidebar — cố định khi cuộn nội dung */}
        <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:w-64 lg:flex-col border-r border-white/10 bg-[#0A3D30] text-white">
          <Sidebar />
        </aside>

        {/* Mobile sidebar */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent
            side="left"
            className="w-72 max-w-[min(20rem,85vw)] p-0 border-white/10 bg-[#0A3D30] text-white [&>button]:z-50 [&>button]:text-white"
          >
            <SheetTitle className="sr-only">Menu điều hướng</SheetTitle>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>

        <div className="flex flex-1 flex-col min-w-0 lg:pl-64 h-screen overflow-hidden">
          <Topbar onMenuClick={() => setMobileOpen(true)} />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
        </div>
      </div>
      <RealtimeNotifications />
    </RealtimeProvider>
  );
}
