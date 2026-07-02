'use client';

import { X } from 'lucide-react';
import { useRealtime } from '@/providers/realtime-provider';
import { cn } from '@/lib/utils';

export function RealtimeNotifications() {
  const { notifications, dismiss } = useRealtime();

  if (notifications.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {notifications.map((n) => (
        <div
          key={n.id}
          className={cn(
            'pointer-events-auto rounded-lg border shadow-lg p-3 text-sm animate-in slide-in-from-right',
            n.type === 'warning' && 'border-amber-300 bg-amber-50',
            n.type === 'success' && 'border-green-300 bg-green-50',
            n.type === 'info' && 'border-blue-200 bg-blue-50',
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold">{n.title}</p>
              {n.message && <p className="text-muted-foreground mt-0.5">{n.message}</p>}
            </div>
            <button
              type="button"
              className="shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => dismiss(n.id)}
              aria-label="Đóng"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
