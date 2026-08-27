'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { RealtimeProvider } from '@/providers/realtime-provider';
import { TrialBanner } from '@/components/billing/trial-banner';
import { useT } from '@/i18n/i18n-provider';

const AssistantWidget = dynamic(
  () =>
    import('@/components/assistant/assistant-widget').then((m) => ({
      default: m.AssistantWidget,
    })),
  { ssr: false, loading: () => null },
);

function DeferredAssistantWidget() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof w.requestIdleCallback === 'function') {
      const id = w.requestIdleCallback(() => setReady(true), { timeout: 2500 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(() => setReady(true), 1500);
    return () => window.clearTimeout(t);
  }, []);
  if (!ready) return null;
  return <AssistantWidget />;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const t = useT();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <RealtimeProvider>
      <div className="flex min-h-screen h-screen overflow-hidden">
        {/* Desktop sidebar — cố định khi cuộn nội dung */}
        <aside className="hidden print:hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:w-64 lg:flex-col border-r border-white/10 bg-[#0A3D30] text-white">
          <Sidebar />
        </aside>

        {/* Mobile sidebar */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent
            side="left"
            className="w-72 max-w-[min(20rem,85vw)] p-0 border-white/10 bg-[#0A3D30] text-white print:hidden [&>button]:z-50 [&>button]:text-white"
          >
            <SheetTitle className="sr-only">{t('layout.navMenu')}</SheetTitle>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>

        <div className="flex flex-1 flex-col min-w-0 lg:pl-64 h-screen overflow-hidden print:pl-0 print:h-auto print:overflow-visible">
          <div className="print:hidden">
            <Topbar onMenuClick={() => setMobileOpen(true)} />
            <TrialBanner />
          </div>
          <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-3 md:p-6 print:overflow-visible print:p-0">
            {children}
          </main>
        </div>
      </div>
      <div className="print:hidden">
        <DeferredAssistantWidget />
      </div>
    </RealtimeProvider>
  );
}
