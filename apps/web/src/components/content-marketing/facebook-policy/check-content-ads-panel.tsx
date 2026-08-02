'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  Copy,
  GitCompare,
  Loader2,
  Megaphone,
  Save,
  Send,
  ShieldAlert,
  Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useContentMarketingMutations } from '@/hooks/use-content-marketing';
import { useCurrentUser } from '@/hooks/use-auth';
import { formatMutationError } from '@/lib/format-mutation-error';
import { cn } from '@/lib/utils';
import {
  SPECIAL_AD_OPTIONS,
  adsUsabilityLabel,
  applyFindingFixes,
  evaluateAdsSendGate,
  evaluateAutoPostGate,
  groupFindingsByBucket,
  needsSpecialAdCategory,
  savePendingAdsHandoff,
  snapshotFromCheckResult,
  type ContentPolicySnapshot,
  type PolicyCheckMode,
  type PolicyFindingBucket,
  POLICY_SEVERITY_STYLE,
  POLICY_STATUS_STYLE,
} from '@/lib/facebook-policy-ui';
import {
  createHistoryId,
  saveContentHistoryItem,
} from '@/lib/content-marketing-form';
import { buildLiveAiPayload, sendToAutoPost } from '@/lib/auto-post-ai-marketing-bridge';
import { FacebookPolicyStatusBadge } from './facebook-policy-status-badge';
import type {
  FacebookPolicyCheckPayload,
  FacebookPolicyCheckResult,
  FacebookPolicyFinding,
  FacebookPolicyRewriteResult,
  FacebookPolicyUrlKind,
  SpecialAdCategory,
} from '@/types/content-marketing';

const BUCKET_ORDER: PolicyFindingBucket[] = [
  'Text',
  'Image',
  'Video',
  'Audio',
  'Landing page',
  'Targeting',
];

const emptyForm = (): FacebookPolicyCheckPayload => ({
  headline: '',
  primaryText: '',
  description: '',
  cta: '',
  productService: '',
  audience: '',
  country: 'VN',
  ageMin: 18,
  ageMax: 65,
  specialAdCategory: 'NONE',
  brandName: '',
  imageOcrText: '',
  transcript: '',
  landingPageText: '',
  landingUrl: '',
});

export type CheckContentAdsInitial = Partial<FacebookPolicyCheckPayload> & {
  mode?: PolicyCheckMode;
  importUrl?: string;
  historyId?: string;
};

export function CheckContentAdsPanel({
  initial,
  compact = false,
  onSnapshotChange,
  onClose,
}: {
  initial?: CheckContentAdsInitial | null;
  compact?: boolean;
  onSnapshotChange?: (snapshot: ContentPolicySnapshot | null, form: FacebookPolicyCheckPayload) => void;
  onClose?: () => void;
}) {
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const {
    checkFacebookPolicy,
    rewriteFacebookPolicy,
    importFacebookPolicyUrl,
    analyzeFacebookPolicyMedia,
  } = useContentMarketingMutations();

  const [mode, setMode] = useState<PolicyCheckMode>(initial?.mode ?? 'meta_ads');
  const [form, setForm] = useState<FacebookPolicyCheckPayload>(() => ({
    ...emptyForm(),
    ...initial,
  }));
  const [importUrl, setImportUrl] = useState(initial?.importUrl ?? '');
  const [urlKind, setUrlKind] = useState<FacebookPolicyUrlKind | 'auto'>('auto');
  const [result, setResult] = useState<FacebookPolicyCheckResult | null>(null);
  const [rewrite, setRewrite] = useState<FacebookPolicyRewriteResult | null>(null);
  const [snapshot, setSnapshot] = useState<ContentPolicySnapshot | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [compareBefore, setCompareBefore] = useState('');
  const [compareAfter, setCompareAfter] = useState('');
  const [showCompare, setShowCompare] = useState(false);
  const [pendingApply, setPendingApply] = useState<FacebookPolicyCheckPayload | null>(null);
  const [mediaInfo, setMediaInfo] = useState('');
  const [msg, setMsg] = useState('');
  const [historyId] = useState(initial?.historyId);

  useEffect(() => {
    if (!initial) return;
    setForm((prev) => ({ ...prev, ...initial }));
    if (initial.mode) setMode(initial.mode);
    if (initial.importUrl) setImportUrl(initial.importUrl);
  }, [initial]);

  const patch = useCallback((p: Partial<FacebookPolicyCheckPayload>) => {
    setForm((prev) => ({ ...prev, ...p }));
  }, []);

  const busy =
    checkFacebookPolicy.isPending ||
    rewriteFacebookPolicy.isPending ||
    importFacebookPolicyUrl.isPending ||
    analyzeFacebookPolicyMedia.isPending;

  const activeFindings = useMemo(
    () => (result?.findings ?? []).filter((f) => !f.dismissedByAi),
    [result],
  );
  const grouped = useMemo(() => groupFindingsByBucket(activeFindings), [activeFindings]);
  const specialNeeded = result ? needsSpecialAdCategory(result.findings) : false;

  const publishSnapshot = useCallback(
    (snap: ContentPolicySnapshot | null, nextForm: FacebookPolicyCheckPayload) => {
      setSnapshot(snap);
      onSnapshotChange?.(snap, nextForm);
    },
    [onSnapshotChange],
  );

  const handleImportUrl = async () => {
    setMsg('');
    try {
      const res = await importFacebookPolicyUrl.mutateAsync({
        url: importUrl.trim(),
        urlKind: urlKind === 'auto' ? undefined : urlKind,
      });
      const next = {
        ...form,
        headline: res.headline || form.headline,
        primaryText: res.primaryText || form.primaryText,
        description: res.description || form.description,
        ...(res.sourceType === 'landing_page' || urlKind === 'landing_page'
          ? {
              landingPageText: res.primaryText || form.landingPageText,
              landingUrl: res.finalUrl || res.url || form.landingUrl,
            }
          : {}),
      };
      setForm(next);
      setMsg(
        res.insufficientData
          ? `${res.message || 'INSUFFICIENT_DATA'} ${(res.warnings || []).join(' ')}`.trim()
          : `Đã import (${res.sourceType}). Kiểm tra và chỉnh sửa trước khi chấm. ${(res.warnings || []).join(' ')}`.trim(),
      );
    } catch (err) {
      setMsg(formatMutationError(err) || 'Import URL thất bại');
    }
  };

  const handleAnalyzeFile = async (file: File | null, kind: 'image' | 'video') => {
    if (!file && !(form.transcript || '').trim()) {
      setMsg('Chọn file hoặc dán transcript trước.');
      return;
    }
    setMsg('');
    try {
      const res = await analyzeFacebookPolicyMedia.mutateAsync({
        mediaType: kind,
        caption: form.primaryText,
        transcript: form.transcript,
        file,
      });
      patch({
        imageOcrText: res.ocrText || form.imageOcrText,
        transcript: res.transcript || form.transcript,
      });
      setMediaInfo(
        res.insufficientData
          ? res.message || 'INSUFFICIENT_DATA'
          : `Media OK · OCR ${res.ocrText.length} · transcript ${res.transcript.length}`,
      );
      setMsg(res.message || res.warnings.join(' ') || 'Đã phân tích media');
    } catch (err) {
      setMsg(formatMutationError(err) || 'Phân tích media thất bại');
    }
  };

  const handleCheck = async () => {
    setMsg('');
    setRewrite(null);
    setPendingApply(null);
    try {
      const res = await checkFacebookPolicy.mutateAsync(form);
      setResult(res);
      const snap = snapshotFromCheckResult(res, form, mode);
      publishSnapshot(snap, form);
      setMsg(res.summary);
      setSelectedIds(new Set(res.findings.filter((f) => !f.dismissedByAi).map((f) => f.id)));
    } catch (err) {
      setMsg(formatMutationError(err) || 'Không kiểm tra được policy');
    }
  };

  const handleRewriteSelected = async (all: boolean) => {
    setMsg('');
    const targets = all
      ? activeFindings
      : activeFindings.filter((f) => selectedIds.has(f.id));
    if (!targets.length) {
      setMsg('Chọn ít nhất một lỗi có nội dung thay thế.');
      return;
    }
    setCompareBefore(form.primaryText || '');
    try {
      const res = await rewriteFacebookPolicy.mutateAsync({
        ...form,
        contentToRewrite: form.primaryText,
      });
      setRewrite(res);
      setCompareAfter(res.rewrittenContent);
      setPendingApply({ ...form, primaryText: res.rewrittenContent });
      setShowCompare(true);
      setMsg(
        'Đã tạo bản sửa. Xác nhận “Áp dụng” để cập nhật — không tự ghi đè. Bắt buộc Kiểm tra lại trước khi chạy Ads.',
      );
      setResult(null);
      publishSnapshot(null, form);
    } catch (err) {
      // Fallback: local suggested replacements
      const local = applyFindingFixes(form, targets);
      setCompareAfter(local.primaryText || '');
      setPendingApply(local);
      setShowCompare(true);
      setMsg(
        formatMutationError(err) ||
          'Dùng gợi ý thay thế cục bộ. Xác nhận áp dụng — không tự ghi đè.',
      );
    }
  };

  const confirmApplyPending = () => {
    if (!pendingApply) return;
    setForm(pendingApply);
    setPendingApply(null);
    setShowCompare(false);
    setResult(null);
    publishSnapshot(null, pendingApply);
    setMsg('Đã áp dụng sửa. Hãy bấm Kiểm tra Content Ads lại.');
  };

  const applySingleFinding = (f: FacebookPolicyFinding) => {
    if (!(f.suggestedReplacement || '').trim()) {
      setMsg('Lỗi này chưa có nội dung thay thế — dùng Sửa lỗi đã chọn / Sửa toàn bộ.');
      return;
    }
    setCompareBefore(form.primaryText || '');
    const next = applyFindingFixes(form, [f]);
    setCompareAfter(next.primaryText || '');
    setPendingApply(next);
    setShowCompare(true);
    setMsg('Xác nhận áp dụng sửa lỗi này? Nội dung gốc chưa bị ghi đè.');
  };

  const handleCopy = async () => {
    const text = [form.headline, form.primaryText, form.cta].filter(Boolean).join('\n\n');
    await navigator.clipboard.writeText(text);
    setMsg('Đã copy content');
  };

  const handleSaveHistory = () => {
    const item = {
      id: historyId || createHistoryId(),
      tab: 'ad' as const,
      title: (form.headline || form.productService || 'Check Content Ads').trim(),
      content: form.primaryText || '',
      contentScore: 0,
      policyScore: snapshot?.riskScore ?? result?.riskScore ?? 0,
      variantCount: 0,
      adsReadiness: snapshot?.policyStatus ?? 'unchecked',
      createdAt: new Date().toISOString(),
      policyCheckId: snapshot?.policyCheckId,
      policyStatus: snapshot?.policyStatus,
      riskScore: snapshot?.riskScore,
      policyVersion: snapshot?.policyVersion,
      checkedAt: snapshot?.checkedAt,
      checkedContentHash: snapshot?.checkedContentHash,
      checkedMediaHash: snapshot?.checkedMediaHash,
      checkedLandingPageHash: snapshot?.checkedLandingPageHash,
      specialAdCategory: form.specialAdCategory,
      needsSpecialAdCategory: snapshot?.needsSpecialAdCategory,
    };
    saveContentHistoryItem(item, user?.id);
    setMsg('Đã lưu lịch sử (kèm trạng thái policy).');
  };

  const handleSendAutoPost = () => {
    const gate = evaluateAutoPostGate({
      snapshot,
      payload: form,
      rewrittenPendingRecheck: Boolean(rewrite && !result),
    });
    if (!gate.ok) {
      setMsg(gate.message);
      return;
    }
    if (gate.level === 'confirm' && !window.confirm(gate.message)) return;
    sendToAutoPost(
      router,
      buildLiveAiPayload('ad', form.headline || form.productService || 'Bài đăng', form.primaryText || ''),
    );
  };

  const handleSendAds = () => {
    const gate = evaluateAdsSendGate({
      snapshot,
      payload: form,
      rewrittenPendingRecheck: Boolean(rewrite && !result),
    });
    if (!gate.ok) {
      setMsg(gate.message);
      return;
    }
    if (gate.level === 'confirm' && !window.confirm(gate.message)) return;
    savePendingAdsHandoff({
      title: form.headline || form.productService || '',
      content: form.primaryText || '',
      cta: form.cta,
      landingUrl: form.landingUrl,
      policy: snapshot,
    });
    router.push('/ads');
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  return (
    <div className={cn('space-y-5', compact ? 'p-1' : 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <ShieldAlert className="h-5 w-5 text-[hsl(var(--brand))]" />
            Check Content Ads
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Kiểm tra bài đăng Facebook hoặc quảng cáo Meta. Sau khi import URL, chỉnh sửa nội dung
            trước khi chấm. Không tự ghi đè nội dung gốc.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FacebookPolicyStatusBadge snapshot={snapshot} payload={form} />
          {onClose ? (
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Đóng
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Chế độ</Label>
          <Select value={mode} onValueChange={(v) => setMode(v as PolicyCheckMode)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="facebook_post">Bài đăng Facebook</SelectItem>
              <SelectItem value="meta_ads">Quảng cáo Meta</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Special Ad Category</Label>
          <Select
            value={form.specialAdCategory ?? 'NONE'}
            onValueChange={(v) => patch({ specialAdCategory: v as SpecialAdCategory })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SPECIAL_AD_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {specialNeeded ? (
            <p className="text-xs text-amber-700">Có dấu hiệu cần khai báo Special Ad Category.</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
        <Label className="text-sm font-semibold">Nhập URL bài viết / video / landing</Label>
        <div className="grid gap-2 lg:grid-cols-[1fr_160px_auto]">
          <Input
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            placeholder="URL Facebook / website / landing page"
          />
          <Select
            value={urlKind}
            onValueChange={(v) => setUrlKind(v as FacebookPolicyUrlKind | 'auto')}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Tự nhận diện</SelectItem>
              <SelectItem value="website">Website</SelectItem>
              <SelectItem value="landing_page">Landing page</SelectItem>
              <SelectItem value="facebook_post">FB bài viết</SelectItem>
              <SelectItem value="facebook_video">FB video</SelectItem>
              <SelectItem value="facebook_reel">FB Reels</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="secondary"
            disabled={busy || !importUrl.trim()}
            onClick={handleImportUrl}
          >
            {importFacebookPolicyUrl.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Lấy nội dung
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <label className="cursor-pointer rounded border border-slate-300 bg-white px-3 py-1.5">
            Upload hình ảnh
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleAnalyzeFile(e.target.files?.[0] ?? null, 'image')}
            />
          </label>
          <label className="cursor-pointer rounded border border-slate-300 bg-white px-3 py-1.5">
            Upload video
            <input
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => handleAnalyzeFile(e.target.files?.[0] ?? null, 'video')}
            />
          </label>
          {mediaInfo ? <span className="text-xs text-slate-600">{mediaInfo}</span> : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Tiêu đề</Label>
            <Input value={form.headline ?? ''} onChange={(e) => patch({ headline: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Nội dung chính</Label>
            <Textarea
              rows={compact ? 5 : 7}
              value={form.primaryText ?? ''}
              onChange={(e) => patch({ primaryText: e.target.value })}
              placeholder="Nhập nội dung thủ công hoặc sau khi import URL"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Mô tả</Label>
            <Textarea
              rows={2}
              value={form.description ?? ''}
              onChange={(e) => patch({ description: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>CTA</Label>
            <Input value={form.cta ?? ''} onChange={(e) => patch({ cta: e.target.value })} />
          </div>
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Landing page (URL)</Label>
            <Input
              value={form.landingUrl ?? ''}
              onChange={(e) => patch({ landingUrl: e.target.value })}
              placeholder="https://..."
            />
          </div>
          <div className="space-y-1.5">
            <Label>Landing page (nội dung đã lấy)</Label>
            <Textarea
              rows={3}
              value={form.landingPageText ?? ''}
              onChange={(e) => patch({ landingPageText: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Sản phẩm / dịch vụ</Label>
            <Input
              value={form.productService ?? ''}
              onChange={(e) => patch({ productService: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Quốc gia quảng cáo</Label>
              <Input
                value={form.country ?? 'VN'}
                onChange={(e) => patch({ country: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Độ tuổi thấp nhất</Label>
              <Input
                type="number"
                min={13}
                max={65}
                value={form.ageMin ?? 18}
                onChange={(e) => patch({ ageMin: Number(e.target.value) || 18 })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>OCR / chữ trên ảnh (có thể sửa)</Label>
            <Textarea
              rows={2}
              value={form.imageOcrText ?? ''}
              onChange={(e) => patch({ imageOcrText: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Transcript (audio / video)</Label>
            <Textarea
              rows={2}
              value={form.transcript ?? ''}
              onChange={(e) => patch({ transcript: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="check-content-ads-actions flex flex-wrap gap-2">
        <Button type="button" data-check-ads-primary disabled={busy} onClick={handleCheck}>
          {checkFacebookPolicy.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <ShieldAlert className="mr-2 h-4 w-4" />
          )}
          Kiểm tra Content Ads
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="text-white"
          disabled={busy || !activeFindings.length}
          onClick={() => handleRewriteSelected(false)}
        >
          <Wand2 className="mr-2 h-4 w-4" />
          Sửa lỗi đã chọn
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="text-white"
          disabled={busy || !activeFindings.length}
          onClick={() => handleRewriteSelected(true)}
        >
          Sửa toàn bộ
        </Button>
        <Button
          type="button"
          variant="outline"
          className="text-white"
          disabled={!compareBefore && !compareAfter}
          onClick={() => setShowCompare((v) => !v)}
        >
          <GitCompare className="mr-2 h-4 w-4" />
          So sánh trước và sau
        </Button>
        <Button type="button" variant="outline" className="text-white" disabled={busy} onClick={handleCheck}>
          Kiểm tra lại
        </Button>
        <Button type="button" variant="outline" className="text-white" onClick={handleCopy}>
          <Copy className="mr-2 h-4 w-4" />
          Copy content
        </Button>
        <Button type="button" variant="outline" className="text-white" onClick={handleSaveHistory}>
          <Save className="mr-2 h-4 w-4" />
          Lưu lịch sử
        </Button>
        <Button type="button" variant="outline" className="text-white" onClick={handleSendAutoPost}>
          <Send className="mr-2 h-4 w-4" />
          Gửi Auto Post
        </Button>
        <Button type="button" variant="outline" className="text-white" onClick={handleSendAds}>
          <Megaphone className="mr-2 h-4 w-4" />
          Gửi sang Ads
        </Button>
      </div>

      {msg ? <p className="text-sm text-slate-700">{msg}</p> : null}

      {showCompare ? (
        <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 lg:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Trước</p>
            <Textarea rows={6} readOnly value={compareBefore} />
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Sau (chưa áp dụng)</p>
            <Textarea
              rows={6}
              value={compareAfter}
              onChange={(e) => {
                setCompareAfter(e.target.value);
                setPendingApply((p) => ({ ...(p || form), primaryText: e.target.value }));
              }}
            />
          </div>
          <div className="lg:col-span-2 flex flex-wrap gap-2">
            <Button type="button" disabled={!pendingApply} onClick={confirmApplyPending}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Áp dụng sửa (xác nhận)
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setPendingApply(null);
                setShowCompare(false);
              }}
            >
              Hủy — giữ nội dung gốc
            </Button>
          </div>
        </div>
      ) : null}

      {result ? (
        <div className="space-y-4">
          <div
            className={cn(
              'grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-3',
              POLICY_STATUS_STYLE[result.overallStatus],
            )}
          >
            <div>
              <p className="text-xs uppercase opacity-70">Điểm rủi ro</p>
              <p className="text-2xl font-semibold">{result.riskScore}/100</p>
            </div>
            <div>
              <p className="text-xs uppercase opacity-70">Độ tin cậy</p>
              <p className="text-2xl font-semibold">{Math.round(result.confidence * 100)}%</p>
            </div>
            <div>
              <p className="text-xs uppercase opacity-70">Trạng thái tổng</p>
              <p className="text-lg font-semibold">{result.overallStatus}</p>
            </div>
            <div className="sm:col-span-2 lg:col-span-3 space-y-1 text-sm">
              <p>
                <span className="font-medium">Khả năng dùng Ads:</span>{' '}
                {adsUsabilityLabel(result.overallStatus)}
              </p>
              <p>
                <span className="font-medium">Special Ad Category:</span>{' '}
                {specialNeeded
                  ? 'Cần chọn / khai báo đúng category'
                  : 'Không bắt buộc từ nội dung hiện tại'}
              </p>
              <p className="text-xs opacity-80">{result.summary}</p>
              {result.policyMeta?.sourceUrl ? (
                <a
                  href={result.policyMeta.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs underline"
                >
                  {result.policyMeta.policyCode} · v{result.policyMeta.policyVersion} — nguồn chính sách
                </a>
              ) : null}
            </div>
          </div>

          {BUCKET_ORDER.map((bucket) => {
            const list = grouped[bucket];
            if (!list.length) return null;
            return (
              <div key={bucket} className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-900">{bucket}</h3>
                <ul className="space-y-2">
                  {list.map((f) => (
                    <li
                      key={f.id}
                      className="rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <label className="flex items-start gap-2">
                          <Checkbox
                            checked={selectedIds.has(f.id)}
                            onCheckedChange={() => toggleSelect(f.id)}
                          />
                          <span>
                            <span className="font-medium">{f.policyGroup}</span>
                            <span className="ml-2 text-xs text-slate-500">{f.policyCode}</span>
                          </span>
                        </label>
                        <span
                          className={cn(
                            'rounded px-2 py-0.5 text-xs font-medium',
                            POLICY_SEVERITY_STYLE[f.severity] || POLICY_SEVERITY_STYLE.LOW,
                          )}
                        >
                          {f.severity}
                        </span>
                      </div>
                      <p className="mt-2 rounded bg-slate-50 px-2 py-1 text-xs text-slate-700">
                        “{f.excerpt}”
                      </p>
                      <p className="mt-2">
                        <span className="font-medium">Lý do:</span> {f.reason}
                      </p>
                      <p>
                        <span className="font-medium">Cách xử lý:</span> {f.remediation}
                      </p>
                      {f.suggestedReplacement ? (
                        <p>
                          <span className="font-medium">Thay thế gợi ý:</span>{' '}
                          {f.suggestedReplacement}
                        </p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-2">
                        {result.policyMeta?.sourceUrl ? (
                          <a
                            href={result.policyMeta.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-[hsl(var(--brand))] underline"
                          >
                            Link nguồn chính sách
                          </a>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => applySingleFinding(f)}
                        >
                          Áp dụng sửa lỗi
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
