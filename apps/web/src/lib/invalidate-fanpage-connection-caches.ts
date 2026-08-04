import type { QueryClient } from '@tanstack/react-query';

/**
 * Invalidate Fanpage connection caches across Auto Post, Messaging, Chatbot.
 * Call after connect / disconnect / sync so every tab sees the same state.
 */
export function invalidateFanpageConnectionCaches(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: ['auto-post'] });
  void qc.invalidateQueries({ queryKey: ['automation', 'channel-connections'] });
  void qc.invalidateQueries({ queryKey: ['chatbot-cskh'] });
}
