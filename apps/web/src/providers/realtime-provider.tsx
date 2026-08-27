'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { WS_EVENTS } from '@marketingspa/shared';
import { authStorage } from '@/lib/auth-storage';
import { invalidateLeadWorkspace } from '@/lib/lead-query-sync';
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

interface RealtimeContextValue {
  connected: boolean;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

/**
 * Socket.IO realtime — cập nhật badge/inbox qua React Query.
 * Không tạo popup/toast tin nhắn (badge ở MessagesHeaderIcon).
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!user?.organizationId || !authStorage.isAuthenticated()) return;

    const socket: Socket = io(`${resolveApiUrl()}/events`, {
      // Prefer polling first — survives brief API restarts better than hard websocket-only 502
      transports: ['polling', 'websocket'],
      upgrade: true,
      auth: { token: authStorage.getAccessToken() ?? '' },
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 800,
    });

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on(WS_EVENTS.LEAD_NEW, () => {
      invalidateLeadWorkspace(queryClient);
    });

    socket.on(WS_EVENTS.LEAD_STALE_ALERT, () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'stale-leads'] });
    });

    socket.on(WS_EVENTS.LEAD_SCORE_CHANGED, () => {
      invalidateLeadWorkspace(queryClient);
    });

    socket.on(WS_EVENTS.LEAD_QUALIFIED, () => {
      invalidateLeadWorkspace(queryClient);
    });

    socket.on(WS_EVENTS.LEAD_SLA_BREACHED, () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'stale-leads'] });
      invalidateLeadWorkspace(queryClient);
    });

    socket.on(WS_EVENTS.LEAD_REASSIGNED, () => {
      invalidateLeadWorkspace(queryClient);
    });

    socket.on(WS_EVENTS.APPOINTMENT_NEW, () => {
      invalidateLeadWorkspace(queryClient);
    });

    socket.on(WS_EVENTS.APPOINTMENT_REMINDER, () => {
      queryClient.invalidateQueries({ queryKey: ['automation', 'logs'] });
    });

    socket.on(
      WS_EVENTS.CHATBOT_MESSAGE_NEW,
      (payload: { conversationId?: string }) => {
        // Chỉ cập nhật badge/inbox — KHÔNG toast, KHÔNG auto-mở dropdown
        void queryClient.invalidateQueries({ queryKey: ['chatbot-cskh', 'inbox'] });
        void queryClient.invalidateQueries({ queryKey: ['chatbot-cskh', 'inbox-unread'] });
        if (payload.conversationId) {
          void queryClient.invalidateQueries({
            queryKey: ['chatbot-cskh', 'inbox', 'detail', payload.conversationId],
          });
        }
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
  }, [user?.organizationId, queryClient]);

  return (
    <RealtimeContext.Provider value={{ connected }}>{children}</RealtimeContext.Provider>
  );
}

export function useRealtime() {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error('useRealtime must be used within RealtimeProvider');
  return ctx;
}
