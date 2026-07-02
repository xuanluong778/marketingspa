'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { WS_EVENTS } from '@marketingspa/shared';
import { authStorage } from '@/lib/auth-storage';
import { useCurrentUser } from '@/hooks/use-auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface RealtimeNotification {
  id: string;
  type: 'info' | 'warning' | 'success';
  title: string;
  message?: string;
  createdAt: number;
}

interface RealtimeContextValue {
  notifications: RealtimeNotification[];
  dismiss: (id: string) => void;
  connected: boolean;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

function pushNotification(
  set: React.Dispatch<React.SetStateAction<RealtimeNotification[]>>,
  n: Omit<RealtimeNotification, 'id' | 'createdAt'>,
) {
  const item: RealtimeNotification = {
    ...n,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
  };
  set((prev) => [item, ...prev].slice(0, 8));
}

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [notifications, setNotifications] = useState<RealtimeNotification[]>([]);
  const [connected, setConnected] = useState(false);

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  useEffect(() => {
    if (!user?.organizationId || !authStorage.isAuthenticated()) return;

    const socket: Socket = io(`${API_URL}/events`, {
      transports: ['websocket', 'polling'],
      query: { organizationId: user.organizationId },
    });

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on(WS_EVENTS.LEAD_NEW, (payload: { name?: string }) => {
      pushNotification(setNotifications, {
        type: 'success',
        title: 'Lead mới',
        message: payload.name ? `${payload.name} vừa được tạo` : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    });

    socket.on(WS_EVENTS.LEAD_STALE_ALERT, (payload: { count?: number }) => {
      pushNotification(setNotifications, {
        type: 'warning',
        title: 'Cảnh báo lead',
        message: `${payload.count ?? 0} lead chưa xử lý > 10 phút`,
      });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'stale-leads'] });
    });

    socket.on(WS_EVENTS.APPOINTMENT_NEW, (payload: { customerName?: string }) => {
      pushNotification(setNotifications, {
        type: 'info',
        title: 'Lịch hẹn mới',
        message: payload.customerName,
      });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    });

    socket.on(
      WS_EVENTS.APPOINTMENT_REMINDER,
      (payload: { customerName?: string; hoursBefore?: number }) => {
        pushNotification(setNotifications, {
          type: 'info',
          title: 'Nhắc lịch (giả lập)',
          message: payload.customerName
            ? `${payload.customerName} — trước ${payload.hoursBefore}h`
            : undefined,
        });
        queryClient.invalidateQueries({ queryKey: ['automation', 'logs'] });
      },
    );

    socket.on(WS_EVENTS.DAILY_REPORT, (payload: { title?: string }) => {
      pushNotification(setNotifications, {
        type: 'success',
        title: 'Báo cáo ngày',
        message: payload.title,
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [user?.organizationId, queryClient]);

  return (
    <RealtimeContext.Provider value={{ notifications, dismiss, connected }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error('useRealtime must be used within RealtimeProvider');
  return ctx;
}
