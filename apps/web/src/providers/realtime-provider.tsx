'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { WS_EVENTS } from '@marketingspa/shared';
import { authStorage } from '@/lib/auth-storage';
import { useCurrentUser } from '@/hooks/use-auth';

function resolveApiUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (fromEnv && !fromEnv.includes('localhost') && !fromEnv.includes('127.0.0.1')) {
    return fromEnv.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return fromEnv?.replace(/\/$/, '') || 'http://localhost:4000';
}

export interface RealtimeNotification {
  id: string;
  type: 'info' | 'warning' | 'success';
  title: string;
  message?: string;
  href?: string;
  createdAt: number;
}

interface RealtimeContextValue {
  messageNotifications: RealtimeNotification[];
  unreadCount: number;
  dismissMessage: (id: string) => void;
  clearUnread: () => void;
  connected: boolean;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

const UNREAD_STORAGE_KEY = 'marketingspa:chatbot-unread';

function readStoredUnread(organizationId?: string): number {
  if (typeof window === 'undefined' || !organizationId) return 0;
  try {
    const raw = sessionStorage.getItem(`${UNREAD_STORAGE_KEY}:${organizationId}`);
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

function writeStoredUnread(organizationId: string | undefined, count: number) {
  if (typeof window === 'undefined' || !organizationId) return;
  try {
    sessionStorage.setItem(`${UNREAD_STORAGE_KEY}:${organizationId}`, String(Math.max(0, count)));
  } catch {
    /* ignore */
  }
}

function pushMessage(
  set: React.Dispatch<React.SetStateAction<RealtimeNotification[]>>,
  n: Omit<RealtimeNotification, 'id' | 'createdAt'>,
) {
  const item: RealtimeNotification = {
    ...n,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
  };
  set((prev) => [item, ...prev].slice(0, 20));
}

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [messageNotifications, setMessageNotifications] = useState<RealtimeNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    setUnreadCount(readStoredUnread(user?.organizationId));
  }, [user?.organizationId]);

  const dismissMessage = useCallback((id: string) => {
    setMessageNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearUnread = useCallback(() => {
    setUnreadCount(0);
    writeStoredUnread(user?.organizationId, 0);
  }, [user?.organizationId]);

  const bumpUnread = useCallback(() => {
    setUnreadCount((prev) => {
      const next = prev + 1;
      writeStoredUnread(user?.organizationId, next);
      return next;
    });
  }, [user?.organizationId]);

  useEffect(() => {
    if (!user?.organizationId || !authStorage.isAuthenticated()) return;

    const socket: Socket = io(`${resolveApiUrl()}/events`, {
      transports: ['websocket', 'polling'],
      auth: { token: authStorage.getAccessToken() ?? '' },
      withCredentials: true,
    });

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on(WS_EVENTS.LEAD_NEW, () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    });

    socket.on(WS_EVENTS.LEAD_STALE_ALERT, () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'stale-leads'] });
    });

    socket.on(WS_EVENTS.APPOINTMENT_NEW, () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    });

    socket.on(WS_EVENTS.APPOINTMENT_REMINDER, () => {
      queryClient.invalidateQueries({ queryKey: ['automation', 'logs'] });
    });

    socket.on(
      WS_EVENTS.CHATBOT_MESSAGE_NEW,
      (payload: {
        conversationId?: string;
        channel?: string;
        preview?: string;
        visitorName?: string;
        pageName?: string;
      }) => {
        const channelLabel =
          payload.channel === 'facebook'
            ? 'Messenger'
            : payload.channel === 'website'
              ? 'Website'
              : payload.channel || 'Chatbot';
        const from =
          payload.visitorName ||
          payload.pageName ||
          (payload.channel === 'facebook' ? 'Khách Messenger' : 'Khách chatbot');
        pushMessage(setMessageNotifications, {
          type: 'info',
          title: `Tin nhắn mới · ${channelLabel}`,
          message: `${from}: ${payload.preview || '...'}`,
          href: '/chatbot-cskh?tab=inbox',
        });
        bumpUnread();
        queryClient.invalidateQueries({ queryKey: ['chatbot-cskh'] });
      },
    );

    socket.on(WS_EVENTS.MESSAGING_CAMPAIGN_UPDATE, () => {
      queryClient.invalidateQueries({ queryKey: ['automation'] });
    });

    socket.on(WS_EVENTS.MESSAGING_CAMPAIGN_RECIPIENT, () => {
      queryClient.invalidateQueries({ queryKey: ['automation'] });
    });

    socket.on(WS_EVENTS.ADS_SYNC_PROGRESS, (payload: unknown) => {
      void queryClient.invalidateQueries({ queryKey: ['ai-ads-manager', 'sync-jobs'] });
      const status =
        payload && typeof payload === 'object' && 'status' in payload
          ? String((payload as { status?: string }).status)
          : '';
      if (status === 'SUCCEEDED' || status === 'FAILED') {
        void queryClient.invalidateQueries({ queryKey: ['ai-ads-manager', 'dashboard'] });
        void queryClient.invalidateQueries({ queryKey: ['ai-ads-manager', 'campaigns'] });
        void queryClient.invalidateQueries({ queryKey: ['ai-ads-manager', 'connections'] });
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [user?.organizationId, queryClient, bumpUnread]);

  return (
    <RealtimeContext.Provider
      value={{
        messageNotifications,
        unreadCount,
        dismissMessage,
        clearUnread,
        connected,
      }}
    >
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error('useRealtime must be used within RealtimeProvider');
  return ctx;
}
