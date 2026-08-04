import { AppShell } from '@/components/layout/app-shell';
import { AuthGuard } from '@/components/layout/auth-guard';
import { SubscriptionGate } from '@/components/layout/subscription-gate';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <SubscriptionGate>
        <AppShell>{children}</AppShell>
      </SubscriptionGate>
    </AuthGuard>
  );
}
