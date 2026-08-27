'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import {
  History,
  Loader2,
  Minimize2,
  Plus,
  SendHorizontal,
  Square,
  Trash2,
} from 'lucide-react';
import Image from 'next/image';
import { ASSISTANT_PERMISSIONS } from '@marketingspa/shared';
import { useCurrentUser, hasPermission } from '@/hooks/use-auth';
import {
  useAssistantSessions,
  useDeleteAssistantSession,
  postAssistantChat,
} from '@/hooks/use-assistant';
import { formatMutationError } from '@/lib/format-mutation-error';
import {
  ASSISTANT_FAB_BASE,
  ASSISTANT_QUICK_PROMPTS,
  ASSISTANT_ROOT_ATTR,
  assistantFilterStorageKey,
  canSeeAssistantWidget,
  expandAssistantInput,
  getSlashAutocompleteSuggestions,
  measureFullWidthFixedBottomBarHeight,
  moveAutocompleteIndex,
  parseStoredSessionFilters,
  resolveAssistantFabOffset,
  resolveAssistantPanelLayout,
  type AssistantFabOffset,
  type AssistantSessionFilters,
} from '@/lib/assistant-ui';
import type { AssistantUiMessage } from '@/types/assistant';
import type { AssistantSessionMessage } from '@/types/assistant';
import { AssistantMessageBody } from './assistant-message';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n/i18n-provider';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';
import type { AssistantSessionDetail } from '@/types/assistant';

/** Public asset: robot avatar for Trợ lý FAB + header */
const ASSISTANT_BOT_ICON = '/assistant/assistant-bot.png';
/** Display name of the internal AI assistant chatbot */
const ASSISTANT_DISPLAY_NAME = 'Trợ lý Bạch Cốt Tinh';

function mapHistoryMessages(rows: AssistantSessionMessage[] | undefined): AssistantUiMessage[] {
  if (!rows?.length) return [];
  const out: AssistantUiMessage[] = [];
  for (const m of rows) {
    if (m.role === 'USER') {
      out.push({ id: m.id, role: 'user', content: m.content, retryText: m.content });
    } else if (m.role === 'ASSISTANT') {
      const metaLinks = m.meta?.links;
      const links = Array.isArray(metaLinks)
        ? (metaLinks as AssistantUiMessage['links'])
        : undefined;
      out.push({ id: m.id, role: 'assistant', content: m.content, links });
    }
  }
  return out;
}

function newLocalId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function partsIsOnlyCommand(input: string): boolean {
  const t = input.trim();
  return /^\/\S*$/.test(t);
}

/**
 * Floating Trợ lý Bạch Cốt Tinh — only for users with assistant.use.
 * Mounted once from AppShell; independent of CSKH inbox/header.
 */
export function AssistantWidget() {
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const rbacOk = canSeeAssistantWidget(user) || hasPermission(user, ASSISTANT_PERMISSIONS.USE);
  // Fail closed on explicit canary deny; features missing treated by canSee
  const canaryOk = user?.features?.assistantEnabled !== false;
  const allowed = Boolean(user && rbacOk && canaryOk);

  if (userLoading || !user || !allowed) {
    return null;
  }

  return <AssistantWidgetInner />;
}

function AssistantWidgetInner() {
  const t = useT();
  const { data: user } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AssistantUiMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [fabOffset, setFabOffset] = useState<AssistantFabOffset>({ ...ASSISTANT_FAB_BASE });
  const [viewport, setViewport] = useState({ width: 1024, height: 768 });
  const [sessionFilters, setSessionFilters] = useState<AssistantSessionFilters>({});
  const [acIndex, setAcIndex] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const listEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const sessionsQuery = useAssistantSessions(open);
  const deleteSession = useDeleteAssistantSession();

  const slashSuggestions = useMemo(() => getSlashAutocompleteSuggestions(input), [input]);

  const panelLayout = useMemo(
    () =>
      resolveAssistantPanelLayout({
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
        fabBottom: fabOffset.bottom,
        fabRight: fabOffset.right,
      }),
    [viewport, fabOffset],
  );

  // Viewport + fixed bottom-bar lift (cheap probes, not full DOM walk)
  useEffect(() => {
    const update = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setViewport({ width: vw, height: vh });

      const candidates = document.querySelectorAll(
        '[class*="fixed"][class*="bottom-0"], [class*="fixed"][class*="bottom-4"], [data-fixed-bottom-bar]',
      );
      const rects: Array<{
        left: number;
        right: number;
        top: number;
        bottom: number;
        width: number;
        height: number;
      }> = [];
      candidates.forEach((el) => {
        if (!(el instanceof HTMLElement)) return;
        if (el.closest(`[${ASSISTANT_ROOT_ATTR}]`)) return;
        const st = window.getComputedStyle(el);
        if (st.position !== 'fixed' && st.position !== 'sticky') return;
        if (st.visibility === 'hidden' || st.display === 'none') return;
        const r = el.getBoundingClientRect();
        if (r.height <= 0) return;
        rects.push({
          left: r.left,
          right: r.right,
          top: r.top,
          bottom: r.bottom,
          width: r.width,
          height: r.height,
        });
      });
      const barH = measureFullWidthFixedBottomBarHeight(rects, { width: vw, height: vh });
      setFabOffset(resolveAssistantFabOffset({ fullWidthFixedBarHeight: barH }));
    };

    update();
    window.addEventListener('resize', update);
    const iv = window.setInterval(update, 1500);
    return () => {
      window.removeEventListener('resize', update);
      window.clearInterval(iv);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open, sending]);

  useEffect(() => {
    if (open) {
      setUnread(0);
      // focus compose
      window.setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open]);

  // Load/persist session filters (scoped org+user+session)
  useEffect(() => {
    if (!user?.id || !user.organizationId || !sessionId) {
      return;
    }
    try {
      const key = assistantFilterStorageKey(user.organizationId, user.id, sessionId);
      const stored = parseStoredSessionFilters(localStorage.getItem(key));
      if (stored) setSessionFilters(stored);
    } catch {
      /* ignore */
    }
  }, [sessionId, user?.id, user?.organizationId]);

  useEffect(() => {
    if (!user?.id || !user.organizationId || !sessionId) return;
    try {
      const key = assistantFilterStorageKey(user.organizationId, user.id, sessionId);
      localStorage.setItem(key, JSON.stringify(sessionFilters));
    } catch {
      /* ignore */
    }
  }, [sessionFilters, sessionId, user?.id, user?.organizationId]);

  useEffect(() => {
    setAcIndex(0);
  }, [input]);

  const loadSession = useCallback(async (id: string) => {
    setGlobalError(null);
    try {
      const detail = await apiClient<AssistantSessionDetail>(`/assistant/sessions/${id}`);
      setSessionId(detail.id);
      setMessages(mapHistoryMessages(detail.messages));
      setShowHistory(false);
      // filters reloaded by effect from session-scoped storage
    } catch (err) {
      setGlobalError(formatMutationError(err, 'Không tải được phiên chat'));
    }
  }, []);

  const startNewChat = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setSessionId(null);
    setMessages([]);
    setGlobalError(null);
    setShowHistory(false);
    setInput('');
    setSessionFilters({});
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setSending(false);
    setMessages((prev) =>
      prev.map((m) =>
        m.pending
          ? {
              ...m,
              pending: false,
              error: true,
              content: m.content || 'Đã dừng. Bạn có thể thử lại.',
            }
          : m,
      ),
    );
  }, []);

  const sendText = useCallback(
    async (raw: string) => {
      const { message: expanded, filters: nextFilters } = expandAssistantInput(raw, sessionFilters);
      if (!expanded || sending) return;

      setSessionFilters(nextFilters);
      setGlobalError(null);
      setInput('');
      const userMsg: AssistantUiMessage = {
        id: newLocalId('u'),
        role: 'user',
        content: expanded,
        retryText: raw,
      };
      const pendingId = newLocalId('a');
      setMessages((prev) => [
        ...prev,
        userMsg,
        {
          id: pendingId,
          role: 'assistant',
          content: 'Đang phân tích…',
          pending: true,
          retryText: raw,
        },
      ]);
      setSending(true);

      const ac = new AbortController();
      abortRef.current = ac;

      try {
        const res = await postAssistantChat({
          sessionId: sessionId || undefined,
          message: expanded,
          filters: {
            period: nextFilters.period,
            dateFrom: nextFilters.dateFrom,
            dateTo: nextFilters.dateTo,
            pageId: nextFilters.pageId ?? undefined,
            pageName: nextFilters.pageName ?? undefined,
            compare: nextFilters.compare,
          },
          signal: ac.signal,
        });
        setSessionId(res.sessionId);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === pendingId
              ? {
                  id: res.messageId || pendingId,
                  role: 'assistant',
                  content: res.content,
                  toolTraces: res.toolTraces,
                  links: res.links,
                  pendingActions: (res.pendingActions ?? []).map((pa) => ({
                    ...pa,
                    uiStatus: 'pending' as const,
                  })),
                  pending: false,
                  retryText: raw,
                }
              : m,
          ),
        );
        if (!open) setUnread((n) => n + 1);
        void sessionsQuery.refetch();
      } catch (err) {
        if (ac.signal.aborted) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === pendingId
                ? {
                    ...m,
                    pending: false,
                    error: true,
                    content: 'Đã dừng yêu cầu.',
                    retryText: raw,
                  }
                : m,
            ),
          );
        } else {
          const msg = formatMutationError(err, 'Không gửi được tin nhắn. Vui lòng thử lại.');
          setGlobalError(msg);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === pendingId
                ? {
                    ...m,
                    pending: false,
                    error: true,
                    content: msg,
                    retryText: raw,
                  }
                : m,
            ),
          );
        }
      } finally {
        if (abortRef.current === ac) abortRef.current = null;
        setSending(false);
      }
    },
    [open, sending, sessionId, sessionFilters, sessionsQuery],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void sendText(input);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setAcIndex((i) => moveAutocompleteIndex(i, 1, slashSuggestions.length));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setAcIndex((i) => moveAutocompleteIndex(i, -1, slashSuggestions.length));
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && input.trim().startsWith('/'))) {
        const pick = slashSuggestions[acIndex];
        if (pick && e.key === 'Tab') {
          e.preventDefault();
          setInput(pick.insertText);
          return;
        }
        // Enter with incomplete slash command (no space after) — accept suggestion
        if (
          e.key === 'Enter' &&
          !e.shiftKey &&
          pick &&
          !/\s/.test(
            input
              .trim()
              .slice(1)
              .replace(/^\S+\s+/, ''),
          ) &&
          partsIsOnlyCommand(input)
        ) {
          e.preventDefault();
          setInput(pick.insertText);
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setInput(input.replace(/\/[^\s]*$/, ''));
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendText(input);
    }
  };

  const fabStyle: CSSProperties = {
    position: 'fixed',
    right: fabOffset.right,
    bottom: fabOffset.bottom,
    zIndex: 60,
  };

  const panelStyle: CSSProperties = panelLayout.isMobile
    ? {
        position: 'fixed',
        left: panelLayout.left as number,
        right: panelLayout.right,
        top: panelLayout.top as number,
        bottom: panelLayout.bottom,
        zIndex: 61,
        maxHeight: panelLayout.maxHeightPx,
      }
    : {
        position: 'fixed',
        right: panelLayout.right,
        bottom: panelLayout.bottom,
        width: panelLayout.widthPx as number,
        height: panelLayout.heightPx as number,
        maxHeight: panelLayout.maxHeightPx,
        zIndex: 61,
      };

  return (
    <div {...{ [ASSISTANT_ROOT_ATTR]: '' }} className="contents">
      {/* Chat panel */}
      {open && (
        <div
          role="dialog"
          aria-label={ASSISTANT_DISPLAY_NAME}
          style={panelStyle}
          className={cn(
            'flex flex-col overflow-hidden border border-slate-200/90 bg-white shadow-2xl',
            'animate-in fade-in zoom-in-95 duration-200',
            panelLayout.isMobile ? 'rounded-xl' : 'rounded-2xl',
          )}
        >
          {/* Header */}
          <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 bg-[#0A3D30] px-3 py-2.5 text-white">
            <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-white shadow-sm ring-1 ring-white/40">
              <Image
                src={ASSISTANT_BOT_ICON}
                alt=""
                width={32}
                height={32}
                className="h-full w-full object-cover"
                priority
                unoptimized
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-tight">{ASSISTANT_DISPLAY_NAME}</p>
              <p className="truncate text-[11px] text-white/70">AI nội bộ · theo quyền của bạn</p>
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-white hover:bg-white/10"
              title="Phiên mới"
              onClick={startNewChat}
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-white hover:bg-white/10"
              title="Lịch sử"
              onClick={() => setShowHistory((v) => !v)}
            >
              <History className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-white hover:bg-white/10"
              title="Thu nhỏ"
              onClick={() => setOpen(false)}
              aria-label="Thu nhỏ"
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
          </div>

          {/* History drawer */}
          {showHistory && (
            <div className="max-h-40 shrink-0 overflow-y-auto border-b border-slate-100 bg-slate-50 px-2 py-2">
              <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Phiên gần đây
              </p>
              {sessionsQuery.isLoading && <p className="px-1 text-xs text-slate-500">{t('common.loading')}</p>}
              {!sessionsQuery.isLoading && !sessionsQuery.data?.length && (
                <p className="px-1 text-xs text-slate-500">{t('assistant.noSessions')}</p>
              )}
              <ul className="space-y-0.5">
                {(sessionsQuery.data ?? []).map((s) => (
                  <li key={s.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      className={cn(
                        'min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-xs hover:bg-white',
                        s.id === sessionId && 'bg-white font-medium text-[#0A3D30]',
                      )}
                      onClick={() => void loadSession(s.id)}
                    >
                      {s.title?.trim() || 'Phiên không tiêu đề'}
                    </button>
                    <button
                      type="button"
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      title="Xóa phiên"
                      onClick={() => {
                        void deleteSession.mutateAsync(s.id).then(() => {
                          if (sessionId === s.id) startNewChat();
                        });
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Messages */}
          <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-slate-50 to-white px-3 py-3">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">
                  Hỏi nhanh về kinh doanh, công việc, Fanpage, khách cần chăm sóc hoặc quảng cáo. Số
                  liệu chỉ lấy từ hệ thống qua tool — không bịa.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {ASSISTANT_QUICK_PROMPTS.map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      disabled={sending}
                      onClick={() => void sendText(q.message)}
                      className="rounded-full border border-[#0A3D30]/20 bg-white px-2.5 py-1 text-[11px] font-medium text-[#0A3D30] shadow-sm transition hover:border-[#0A3D30]/40 hover:bg-emerald-50 disabled:opacity-50"
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400">
                  Lệnh: /doanh-thu · /cong-viec · /fanpage · /khach-hang · /quang-cao ·
                  /bao-cao-ngay
                </p>
              </div>
            )}

            <div className="space-y-3">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}
                >
                  <div
                    className={cn(
                      'max-w-[92%] rounded-2xl px-3 py-2 shadow-sm',
                      m.role === 'user'
                        ? 'rounded-br-md bg-[#0A3D30] text-white'
                        : m.error
                          ? 'rounded-bl-md border border-red-200 bg-red-50 text-red-900'
                          : 'rounded-bl-md border border-slate-200/80 bg-white text-slate-800',
                    )}
                  >
                    {m.role === 'user' ? (
                      <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">
                        {m.content}
                      </p>
                    ) : (
                      <>
                        {m.pending ? (
                          <div className="flex items-center gap-2 text-[13px] text-slate-500">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            {m.content}
                          </div>
                        ) : (
                          <AssistantMessageBody
                            content={m.content}
                            toolTraces={m.toolTraces}
                            links={m.links}
                            pendingActions={m.pendingActions}
                            user={user}
                            error={m.error}
                            onPendingActionUpdate={(next) => {
                              setMessages((prev) =>
                                prev.map((msg) =>
                                  msg.id !== m.id
                                    ? msg
                                    : {
                                        ...msg,
                                        pendingActions: (msg.pendingActions ?? []).map((pa) =>
                                          pa.actionId === next.actionId ? next : pa,
                                        ),
                                      },
                                ),
                              );
                            }}
                            onRetry={
                              m.retryText
                                ? () => {
                                    void sendText(m.retryText!);
                                  }
                                : undefined
                            }
                          />
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div ref={listEndRef} />
          </div>

          {globalError && (
            <div className="shrink-0 border-t border-red-100 bg-red-50 px-3 py-1.5 text-[11px] text-red-700">
              {globalError}
            </div>
          )}

          {/* Composer */}
          <form
            onSubmit={onSubmit}
            className="relative shrink-0 border-t border-slate-100 bg-white px-2.5 py-2"
          >
            {slashSuggestions.length > 0 && (
              <ul
                className="absolute bottom-full left-2 right-2 z-10 mb-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
                role="listbox"
              >
                {slashSuggestions.map((s, i) => (
                  <li key={`${s.command}-${s.insertText}`}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={i === acIndex}
                      className={cn(
                        'flex w-full items-center justify-between px-2.5 py-1.5 text-left text-xs',
                        i === acIndex ? 'bg-emerald-50 text-[#0A3D30]' : 'hover:bg-slate-50',
                      )}
                      onMouseDown={(ev) => {
                        ev.preventDefault();
                        setInput(s.insertText);
                      }}
                    >
                      <span className="font-mono font-medium">{s.command}</span>
                      <span className="ml-2 truncate text-slate-500">{s.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {(sessionFilters.period || sessionFilters.pageName || sessionFilters.compare) && (
              <div className="mb-1.5 flex flex-wrap gap-1 text-[10px] text-slate-500">
                <span className="rounded bg-slate-100 px-1.5 py-0.5">
                  Lọc session: {sessionFilters.period ?? '—'}
                  {sessionFilters.pageName ? ` · ${sessionFilters.pageName}` : ''}
                  {sessionFilters.compare ? ' · so sánh' : ''}
                </span>
              </div>
            )}
            <div className="flex items-end gap-1.5">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder="Hỏi… hoặc /doanh-thu 7-ngay"
                disabled={sending}
                className="max-h-28 min-h-[40px] flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 caret-slate-900 outline-none ring-orange-400/40 placeholder:text-slate-400 focus:border-orange-300 focus:bg-white focus:ring-2 disabled:opacity-60"
              />
              {sending ? (
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-10 w-10 shrink-0"
                  onClick={stop}
                  title="Dừng"
                  aria-label="Dừng"
                >
                  <Square className="h-4 w-4 fill-current" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  className="h-10 w-10 shrink-0 bg-orange-500 hover:bg-orange-600"
                  disabled={!input.trim()}
                  title="Gửi"
                  aria-label="Gửi"
                >
                  <SendHorizontal className="h-4 w-4" />
                </Button>
              )}
            </div>
          </form>
        </div>
      )}

      {/* FAB */}
      <button
        type="button"
        style={fabStyle}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? `Đóng ${ASSISTANT_DISPLAY_NAME}` : `Mở ${ASSISTANT_DISPLAY_NAME}`}
        aria-expanded={open}
        title={ASSISTANT_DISPLAY_NAME}
        className={cn(
          'relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-full',
          'shadow-lg transition hover:scale-105 hover:shadow-xl',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2',
          open
            ? 'bg-gradient-to-br from-orange-500 to-orange-600 text-white ring-2 ring-white ring-offset-2 ring-offset-[#0A3D30]'
            : 'border-2 border-white bg-[#0B0F2A] shadow-orange-500/20',
        )}
      >
        {open ? (
          <Minimize2 className="h-6 w-6 text-white" />
        ) : (
          <Image
            src={ASSISTANT_BOT_ICON}
            alt={ASSISTANT_DISPLAY_NAME}
            width={56}
            height={56}
            className="h-full w-full object-cover"
            priority
            unoptimized
          />
        )}
        {!open && unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
    </div>
  );
}
