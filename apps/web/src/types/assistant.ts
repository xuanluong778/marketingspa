import type { AssistantLink } from '@marketingspa/shared';
import type { AssistantToolTracePublic } from '@/lib/assistant-ui';

export type AssistantSessionSummary = {
  id: string;
  title: string | null;
  timezone: string;
  status: string;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AssistantMessageRole = 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL';

export type AssistantSessionMessage = {
  id: string;
  role: AssistantMessageRole;
  content: string;
  toolName?: string | null;
  toolCallId?: string | null;
  meta?: Record<string, unknown> | null;
  createdAt: string;
};

export type AssistantSessionDetail = AssistantSessionSummary & {
  messages?: AssistantSessionMessage[];
};

export type AssistantChatResponse = {
  sessionId: string;
  messageId: string;
  content: string;
  toolTraces: AssistantToolTracePublic[];
  links: AssistantLink[];
  pendingActions?: AssistantPendingActionUi[];
  requestId: string;
  timezone: string;
};

export type AssistantPendingActionUi = {
  actionId: string;
  tool: string;
  confirmToken: string;
  expiresAt: string;
  preview: {
    action?: string;
    tool?: string;
    actor?: { userId?: string; role?: string; label?: string };
    targets?: Array<{ type?: string; id?: string; label?: string }>;
    changes?: Array<{ field?: string; from?: unknown; to?: unknown }>;
    warnings?: string[];
  };
  requiresConfirmation: true;
  /** Local UI status after user interacts */
  uiStatus?: 'pending' | 'confirmed' | 'cancelled' | 'error' | 'expired';
  uiMessage?: string;
};

/** Local bubble for the widget (optimistic + API). */
export type AssistantUiMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolTraces?: AssistantToolTracePublic[];
  links?: AssistantLink[];
  pendingActions?: AssistantPendingActionUi[];
  pending?: boolean;
  error?: boolean;
  /** Original user text for retry */
  retryText?: string;
};
