'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  collectKpisFromTraces,
  extractStructuredBlocks,
  filterAssistantLinks,
  pickActionLinks,
  toolErrorSummaries,
  type AssistantKpi,
  type AssistantToolTracePublic,
} from '@/lib/assistant-ui';
import type { AuthUser } from '@/types/api';
import type { AssistantLink } from '@marketingspa/shared';
import type { AssistantPendingActionUi } from '@/types/assistant';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ExternalLink, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { createIdempotencyKey } from '@/lib/assistant-ui';
import { formatMutationError } from '@/lib/format-mutation-error';

function KpiGrid({ kpis }: { kpis: AssistantKpi[] }) {
  if (!kpis.length) return null;
  return (
    <div className="mt-2 grid grid-cols-2 gap-1.5">
      {kpis.map((k, i) => (
        <div
          key={`${k.label}-${i}`}
          className="rounded-md border border-slate-200/80 bg-white/80 px-2 py-1.5 shadow-sm"
        >
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 line-clamp-1">
            {k.label}
          </p>
          <p className="text-sm font-semibold text-[#0A3D30] tabular-nums">
            {k.value}
            {k.unit ? (
              <span className="ml-0.5 text-xs font-normal text-slate-500">{k.unit}</span>
            ) : null}
          </p>
        </div>
      ))}
    </div>
  );
}

function DataTable({ table }: { table: { headers: string[]; rows: string[][] } }) {
  return (
    <div className="mt-2 overflow-x-auto rounded-md border border-slate-200">
      <table className="w-full min-w-[200px] text-left text-[11px]">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            {table.headers.map((h) => (
              <th key={h} className="px-2 py-1 font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, ri) => (
            <tr key={ri} className="border-t border-slate-100">
              {row.map((cell, ci) => (
                <td key={ci} className="px-2 py-1 text-slate-800 whitespace-nowrap">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WriteConfirmCard({
  action,
  onUpdated,
}: {
  action: AssistantPendingActionUi;
  onUpdated?: (next: AssistantPendingActionUi) => void;
}) {
  const [busy, setBusy] = useState(false);
  const status = action.uiStatus ?? 'pending';
  const preview = action.preview ?? {};
  const timeExpired = action.expiresAt ? Date.parse(action.expiresAt) <= Date.now() : false;
  const expired = status === 'expired' || timeExpired;

  const confirm = async () => {
    if (busy || expired || status !== 'pending') return;
    setBusy(true);
    try {
      const idem = createIdempotencyKey();
      await apiClient('/assistant/actions/confirm', {
        method: 'POST',
        body: JSON.stringify({
          actionId: action.actionId,
          confirmToken: action.confirmToken,
          idempotencyKey: idem,
        }),
        headers: { 'Idempotency-Key': idem },
      });
      onUpdated?.({
        ...action,
        uiStatus: 'confirmed',
        uiMessage: 'Đã thực hiện thành công.',
        confirmToken: '',
      });
    } catch (err) {
      const msg = formatMutationError(err, 'Xác nhận thất bại — không ghi dữ liệu.');
      onUpdated?.({
        ...action,
        uiStatus: 'error',
        uiMessage: msg,
      });
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (busy || status !== 'pending') return;
    setBusy(true);
    try {
      await apiClient('/assistant/actions/cancel', {
        method: 'POST',
        body: JSON.stringify({ actionId: action.actionId }),
      });
      onUpdated?.({
        ...action,
        uiStatus: 'cancelled',
        uiMessage: 'Đã huỷ — không ghi dữ liệu.',
        confirmToken: '',
      });
    } catch (err) {
      const msg = formatMutationError(err, 'Huỷ thất bại');
      onUpdated?.({ ...action, uiStatus: 'error', uiMessage: msg });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 rounded-md border border-[#0A3D30]/35 bg-[#F4FBF7] px-2.5 py-2 text-[12px] text-slate-800 shadow-sm">
      <p className="font-semibold text-[#0A3D30]">{preview.action || 'Thao tác cần xác nhận'}</p>
      <p className="mt-0.5 text-[11px] text-slate-600">
        Tool: <span className="font-mono">{action.tool}</span>
      </p>
      {preview.actor ? (
        <p className="text-[11px] text-slate-600">
          Người thực hiện: {preview.actor.label || preview.actor.role || '—'} (
          {preview.actor.userId ? `${preview.actor.userId.slice(0, 8)}…` : 'JWT'})
        </p>
      ) : null}
      {preview.targets?.length ? (
        <div className="mt-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
            Đối tượng
          </p>
          <ul className="list-disc pl-3 text-[11px]">
            {preview.targets.map((t, i) => (
              <li key={i}>
                {t.type}: {t.label}
                {t.id ? ` (${t.id.slice(0, 8)}…)` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {preview.changes?.length ? (
        <div className="mt-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
            Dữ liệu thay đổi
          </p>
          <ul className="list-disc pl-3 text-[11px]">
            {preview.changes.map((c, i) => (
              <li key={i}>
                <span className="font-medium">{c.field}</span>
                {c.from != null ? `: ${String(c.from)} → ` : ': '}
                {c.to == null ? '—' : String(c.to)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {preview.warnings?.length ? (
        <ul className="mt-1 list-disc pl-3 text-[11px] text-amber-800">
          {preview.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      ) : null}
      {action.expiresAt ? (
        <p className="mt-1 text-[10px] text-slate-500">
          Hết hạn: {new Date(action.expiresAt).toLocaleString('vi-VN')}
        </p>
      ) : null}

      {status === 'pending' && !expired ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button
            type="button"
            size="sm"
            className="h-7 bg-[#0A3D30] px-2.5 text-[11px] text-white hover:bg-[#0A3D30]/90"
            disabled={busy}
            onClick={() => void confirm()}
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Xác nhận thực hiện
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-[11px]"
            disabled={busy}
            onClick={() => void cancel()}
          >
            Huỷ
          </Button>
        </div>
      ) : (
        <p
          className={cn(
            'mt-1.5 text-[11px] font-medium',
            status === 'confirmed' && 'text-emerald-700',
            status === 'cancelled' && 'text-slate-600',
            (status === 'error' || expired) && 'text-orange-700',
          )}
        >
          {status === 'confirmed' && (action.uiMessage || 'Đã thực hiện.')}
          {status === 'cancelled' && (action.uiMessage || 'Đã huỷ.')}
          {status === 'error' && (action.uiMessage || 'Lỗi — không ghi dữ liệu.')}
          {timeExpired &&
            status !== 'confirmed' &&
            status !== 'cancelled' &&
            status !== 'error' &&
            'Hết hạn — không ghi dữ liệu.'}
          {status === 'expired' && !timeExpired && 'Hết hạn — không ghi dữ liệu.'}
        </p>
      )}
    </div>
  );
}

export function AssistantMessageBody({
  content,
  toolTraces,
  links,
  pendingActions,
  user,
  onRetry,
  onPendingActionUpdate,
  error,
}: {
  content: string;
  toolTraces?: AssistantToolTracePublic[];
  links?: AssistantLink[];
  pendingActions?: AssistantPendingActionUi[];
  user?: AuthUser;
  onRetry?: () => void;
  onPendingActionUpdate?: (action: AssistantPendingActionUi) => void;
  error?: boolean;
}) {
  const kpis = collectKpisFromTraces(toolTraces);
  const errs = toolErrorSummaries(toolTraces);
  const structured = extractStructuredBlocks(content);
  const visibleLinks = filterAssistantLinks(links, user);
  const actions = pickActionLinks(visibleLinks);

  const actionBtnClass =
    'h-7 gap-1 border border-[#0A3D30] bg-[#0A3D30] px-2.5 text-[11px] font-medium text-white shadow-none hover:bg-[#0C4A3A] hover:text-white';

  const ActionBtn = ({ link, label }: { link?: AssistantLink; label: string }) => {
    if (!link) return null;
    return (
      <Button asChild size="sm" variant="default" className={actionBtnClass}>
        <Link
          href={link.href}
          prefetch={false}
          className="inline-flex items-center gap-1 text-white no-underline"
        >
          <ExternalLink className="h-3 w-3 shrink-0 text-white" strokeWidth={2.25} />
          <span className="text-white">{label}</span>
        </Link>
      </Button>
    );
  };

  return (
    <div className="space-y-1.5">
      {structured.paragraphs.map((p, i) => (
        <p key={i} className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">
          {p}
        </p>
      ))}
      {structured.listItems.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[13px]">
          {structured.listItems.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      )}
      {structured.table ? <DataTable table={structured.table} /> : null}
      <KpiGrid kpis={kpis} />
      {errs.length > 0 && (
        <div className="mt-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
          <p className="font-medium">Tool không trả số liệu:</p>
          <ul className="mt-0.5 list-disc pl-3">
            {errs.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {pendingActions?.map((pa) => (
        <WriteConfirmCard key={pa.actionId} action={pa} onUpdated={onPendingActionUpdate} />
      ))}

      <div className="mt-2 flex flex-wrap gap-1.5">
        <ActionBtn link={actions.detail} label="Xem báo cáo chi tiết" />
        <ActionBtn link={actions.work} label="Mở công việc" />
        <ActionBtn link={actions.customer} label="Mở khách hàng" />
        <ActionBtn link={actions.conversation} label="Mở hội thoại" />
        {actions.rest.map((link) => (
          <Button
            key={`${link.rel}-${link.href}-${link.label}`}
            asChild
            size="sm"
            variant="default"
            className={actionBtnClass}
          >
            <Link
              href={link.href}
              prefetch={false}
              className="inline-flex items-center gap-1 text-white no-underline"
            >
              <ExternalLink className="h-3 w-3 shrink-0 text-white" strokeWidth={2.25} />
              <span className="text-white">{link.label}</span>
            </Link>
          </Button>
        ))}
      </div>

      {error && onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className={cn(
            'mt-1 text-[11px] font-medium text-orange-600 underline-offset-2 hover:underline',
          )}
        >
          Thử lại
        </button>
      ) : null}
    </div>
  );
}
