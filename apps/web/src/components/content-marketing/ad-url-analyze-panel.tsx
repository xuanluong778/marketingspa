'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Link2, Sparkles, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { AdPostKind, ContentFormState } from '@/types/content-marketing';
import {
  useAdUrlAnalyzeJob,
  useCancelAdUrlAnalyze,
  useStartAdUrlAnalyze,
  type AdUrlAnalyzeSuggestion,
} from '@/hooks/use-ad-url-analyze';
import {
  applyAdUrlSuggestionToForm,
  buildAdUrlPreviewFields,
  findOverwriteConflicts,
  type AdUrlPreviewField,
} from '@/lib/ad-url-analyze-apply';

export function AdUrlAnalyzePanel({
  adPostKind,
  brandName,
  form,
  onApplyForm,
  onDirtyChange,
}: {
  adPostKind: AdPostKind;
  brandName: string;
  form: ContentFormState;
  onApplyForm: (next: ContentFormState) => void;
  /** Notify parent when panel has URL / job so “Làm mới” can confirm + clear. */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [sourceUrl, setSourceUrl] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [localError, setLocalError] = useState('');
  const [applyMsg, setApplyMsg] = useState('');
  const resultRef = useRef<HTMLDivElement>(null);

  const startMut = useStartAdUrlAnalyze();
  const cancelMut = useCancelAdUrlAnalyze();
  const { data: job, isFetching } = useAdUrlAnalyzeJob(jobId);

  useEffect(() => {
    onDirtyChange?.(Boolean(sourceUrl.trim() || jobId));
  }, [sourceUrl, jobId, onDirtyChange]);

  const previewFields = useMemo(() => {
    if (!job?.result) return [] as AdUrlPreviewField[];
    return buildAdUrlPreviewFields(job.result as AdUrlAnalyzeSuggestion);
  }, [job?.result]);

  useEffect(() => {
    if (previewFields.length === 0) return;
    setSelected((prev) => {
      const next: Record<string, boolean> = {};
      for (const f of previewFields) {
        next[f.key] = prev[f.key] ?? true;
      }
      return next;
    });
  }, [previewFields]);

  useEffect(() => {
    if (job?.status === 'completed' || job?.status === 'failed') {
      resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [job?.status]);

  const busy =
    startMut.isPending ||
    cancelMut.isPending ||
    (jobId != null &&
      job != null &&
      (job.status === 'pending' || job.status === 'processing'));

  const handleAnalyze = async () => {
    setLocalError('');
    setApplyMsg('');
    if (!sourceUrl.trim()) {
      setLocalError('Nhập link sản phẩm/dịch vụ công khai.');
      return;
    }
    try {
      const res = await startMut.mutateAsync({
        sourceUrl: sourceUrl.trim(),
        adPostKind,
        brandName: brandName.trim() || undefined,
      });
      setJobId(res.id);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Không bắt đầu được phân tích.');
    }
  };

  const handleCancel = async () => {
    if (!jobId) return;
    try {
      await cancelMut.mutateAsync(jobId);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Không hủy được job.');
    }
  };

  const handleApply = () => {
    if (!job?.result) return;
    const chosen = previewFields.filter((f) => selected[f.key]);
    if (chosen.length === 0) {
      setLocalError('Chọn ít nhất một trường để áp dụng.');
      return;
    }
    const conflicts = findOverwriteConflicts(form, chosen);
    let allowOverwrite = false;
    if (conflicts.length > 0) {
      const ok = window.confirm(
        `Có ${conflicts.length} trường đã có dữ liệu:\n` +
          conflicts.map((c) => `• ${c.label}`).join('\n') +
          `\n\nChọn OK để ghi đè các trường đã chọn, Cancel để chỉ điền trường trống.`,
      );
      allowOverwrite = ok;
      if (!ok) {
        // User chose not to overwrite — still apply empty-only
        allowOverwrite = false;
      }
    }
    const next = applyAdUrlSuggestionToForm(form, chosen, { allowOverwrite });
    onApplyForm(next);
    setApplyMsg(
      allowOverwrite
        ? 'Đã áp dụng (có ghi đè theo xác nhận).'
        : 'Đã áp dụng — chỉ điền trường trống (trừ khi bạn xác nhận ghi đè).',
    );
    setTimeout(() => setApplyMsg(''), 4000);
  };

  const toggleAll = (value: boolean) => {
    const next: Record<string, boolean> = {};
    for (const f of previewFields) next[f.key] = value;
    setSelected(next);
  };

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-emerald-300 bg-emerald-50/40 p-3">
      <div className="flex items-start gap-2">
        <Link2 className="mt-0.5 h-4 w-4 text-emerald-800" />
        <div>
          <p className="text-sm font-medium text-emerald-950">Phân tích link & tự điền form</p>
          <p className="text-xs text-emerald-900/80">
            Hỗ trợ website / landing / trang sản phẩm công khai. Facebook, TikTok và sàn TMĐT thường
            không đọc được.
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Link sản phẩm / dịch vụ</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={sourceUrl}
            placeholder="https://example.com/san-pham/..."
            onChange={(e) => setSourceUrl(e.target.value)}
            disabled={busy}
            className="bg-white"
          />
          <Button
            type="button"
            size="sm"
            className="shrink-0"
            disabled={busy || !sourceUrl.trim()}
            onClick={() => void handleAnalyze()}
          >
            {startMut.isPending || busy ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            )}
            Phân tích & tự điền
          </Button>
        </div>
      </div>

      {localError ? <p className="text-xs text-red-700">{localError}</p> : null}
      {applyMsg ? <p className="text-xs text-emerald-700">{applyMsg}</p> : null}

      {jobId && job ? (
        <div ref={resultRef} className="space-y-2 rounded-md border border-emerald-200 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-slate-900">
                {job.stageLabel}
                {isFetching && busy ? '…' : ''}
              </p>
              <p className="text-xs text-slate-500">
                {job.progressPercent}% · {job.sourceUrl}
              </p>
            </div>
            {(job.status === 'pending' || job.status === 'processing') && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void handleCancel()}
                disabled={cancelMut.isPending}
              >
                <XCircle className="mr-1 h-3.5 w-3.5" />
                Hủy
              </Button>
            )}
          </div>

          <div className="h-2 overflow-hidden rounded bg-slate-100">
            <div
              className="h-full bg-emerald-600 transition-all"
              style={{ width: `${Math.min(100, Math.max(0, job.progressPercent))}%` }}
            />
          </div>

          {job.status === 'failed' ? (
            <p className="text-sm text-red-700">
              {job.errorMessage || 'Phân tích thất bại.'}
              {job.errorCode ? ` (${job.errorCode})` : ''}
            </p>
          ) : null}

          {job.status === 'cancelled' ? (
            <p className="text-sm text-amber-800">Đã hủy phân tích.</p>
          ) : null}

          {job.status === 'completed' && job.result ? (
            <div className="space-y-2">
              {job.result.warnings?.length ? (
                <ul className="list-disc space-y-0.5 pl-4 text-xs text-amber-800">
                  {job.result.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              ) : null}
              {job.result.omittedFields?.length ? (
                <p className="text-xs text-slate-500">
                  Không điền (thiếu bằng chứng nguồn): {job.result.omittedFields.slice(0, 8).join(', ')}
                  {job.result.omittedFields.length > 8 ? '…' : ''}
                </p>
              ) : null}

              {previewFields.length === 0 ? (
                <p className="text-sm text-slate-600">
                  Không tìm thấy trường đủ tin cậy để điền. Hãy nhập tay hoặc thử link khác.
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button
                      type="button"
                      className="underline text-slate-600"
                      onClick={() => toggleAll(true)}
                    >
                      Chọn tất cả
                    </button>
                    <button
                      type="button"
                      className="underline text-slate-600"
                      onClick={() => toggleAll(false)}
                    >
                      Bỏ chọn
                    </button>
                  </div>
                  <ul className="max-h-64 space-y-2 overflow-y-auto">
                    {previewFields.map((f) => (
                      <li key={f.key}>
                        <label
                          className={cn(
                            'flex cursor-pointer gap-2 rounded border border-slate-200 p-2 text-sm hover:bg-slate-50',
                            selected[f.key] && 'border-emerald-400 bg-emerald-50/50',
                          )}
                        >
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={Boolean(selected[f.key])}
                            onChange={(e) =>
                              setSelected((prev) => ({ ...prev, [f.key]: e.target.checked }))
                            }
                          />
                          <span>
                            <span className="font-medium text-slate-800">{f.label}</span>
                            <span className="mt-0.5 block whitespace-pre-wrap text-slate-600">
                              {f.value}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  <Button type="button" size="sm" onClick={handleApply}>
                    Áp dụng vào form
                  </Button>
                  <p className="text-[11px] text-slate-500">
                    Mặc định chỉ điền trường trống. Nếu trường đã có nội dung, hệ thống sẽ hỏi xác nhận
                    trước khi ghi đè.
                  </p>
                </>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
