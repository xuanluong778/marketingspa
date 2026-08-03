'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  Copy,
  FileText,
  Loader2,
  Pencil,
  RotateCcw,
  Save,
  Sparkles,
  Upload,
  Wand2,
} from 'lucide-react';
import {
  VIDEO_TRANSCRIPTION_STAGE_LABELS,
  VIDEO_TRANSCRIPTION_STAGES,
  type VideoTranscriptionStage,
} from '@marketingspa/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCurrentUser } from '@/hooks/use-auth';
import {
  stashTranscriptForArticle,
  useCreateVideoTranscription,
  usePatchVideoTranscriptionText,
  useRetryVideoTranscription,
  useRetryVideoTranscriptionChunk,
  useVideoTranscription,
} from '@/hooks/use-video-transcription';
import {
  createHistoryId,
  saveContentHistoryItem,
} from '@/lib/content-marketing-form';
import { buildContentAutoPostHref } from '@/lib/content-auto-post-routes';
import { formatMutationError } from '@/lib/format-mutation-error';
import { apiClient } from '@/lib/api-client';

const PROGRESS_STAGES: VideoTranscriptionStage[] = [
  'validating',
  'extracting_audio',
  'transcribing',
  'cleaning',
  'completed',
];

const LANG_OPTIONS = [
  { value: 'auto', label: 'Tự động nhận diện' },
  { value: 'vi', label: 'Tiếng Việt' },
  { value: 'en', label: 'English' },
  { value: 'zh', label: '中文' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'th', label: 'ไทย' },
] as const;

function stageIndex(stage: string): number {
  const i = PROGRESS_STAGES.indexOf(stage as VideoTranscriptionStage);
  if (stage === 'queued') return -1;
  if (stage === 'failed') return -2;
  return i;
}

export function VideoTranscriptionStudio() {
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const [sourceUrl, setSourceUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState('auto');
  const [glossary, setGlossary] = useState('');
  const [ownership, setOwnership] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [editorText, setEditorText] = useState('');
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const createMut = useCreateVideoTranscription();
  const retryMut = useRetryVideoTranscription();
  const retryChunkMut = useRetryVideoTranscriptionChunk();
  const patchMut = usePatchVideoTranscriptionText();
  const { data: job, isFetching } = useVideoTranscription(jobId, true);

  useEffect(() => {
    void apiClient<{ terms: string[] }>('/video-transcriptions/glossary')
      .then((res) => {
        if (res.terms?.length && !glossary.trim()) {
          setGlossary(res.terms.join(', '));
        }
      })
      .catch(() => {
        /* ignore */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (job?.status === 'completed' && job.cleanedTranscript != null) {
      setEditorText(job.cleanedTranscript);
      setEditing(false);
    }
  }, [job?.id, job?.status, job?.cleanedTranscript, job?.updatedAt]);

  const busy =
    createMut.isPending || retryMut.isPending || retryChunkMut.isPending || patchMut.isPending;
  const currentStage = job?.stage ?? 'queued';
  const idx = stageIndex(currentStage);

  const progressHint = useMemo(() => {
    if (!job) return null;
    if (job.status === 'failed') return job.errorMessage || 'Xử lý thất bại';
    if (job.status === 'completed') return 'Hoàn tất';
    return VIDEO_TRANSCRIPTION_STAGE_LABELS[currentStage as VideoTranscriptionStage] || 'Đang xử lý…';
  }, [job, currentStage]);

  const handleSubmit = useCallback(async () => {
    setMsg(null);
    if (!ownership) {
      setMsg('Vui lòng xác nhận bạn sở hữu hoặc có quyền sử dụng video.');
      return;
    }
    if (!file && !sourceUrl.trim()) {
      setMsg('Nhập link YouTube hoặc tải lên file video/audio.');
      return;
    }
    try {
      const res = await createMut.mutateAsync({
        sourceUrl: file ? undefined : sourceUrl.trim(),
        language,
        ownershipConfirmed: ownership,
        glossary,
        file,
      });
      setJobId(res.id);
      setEditorText('');
      setMsg(null);
    } catch (err) {
      setMsg(formatMutationError(err) || 'Không tạo được yêu cầu');
    }
  }, [ownership, file, sourceUrl, language, glossary, createMut]);

  const handleCopy = useCallback(async () => {
    if (!editorText.trim()) return;
    await navigator.clipboard.writeText(editorText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }, [editorText]);

  const handleSave = useCallback(() => {
    if (!editorText.trim()) return;
    saveContentHistoryItem(
      {
        id: createHistoryId(),
        tab: 'personal',
        title: `Văn bản từ video · ${new Date().toLocaleString('vi-VN')}`,
        content: editorText.trim(),
        contentScore: 0,
        policyScore: 0,
        variantCount: 0,
        adsReadiness: 'transcript',
        createdAt: new Date().toISOString(),
      },
      user?.id,
    );
    setMsg('Đã lưu văn bản vào Thư viện bài viết (máy này).');
  }, [editorText, user?.id]);

  const handleWriteArticle = useCallback(() => {
    if (!editorText.trim()) return;
    stashTranscriptForArticle(editorText.trim());
    router.push(
      buildContentAutoPostHref('create', {
        section: 'personal',
        mode: 'topic',
        from: 'video-transcript',
      }),
    );
  }, [editorText, router]);

  const handleSaveEdit = useCallback(async () => {
    if (!jobId) return;
    try {
      await patchMut.mutateAsync({ id: jobId, cleanedTranscript: editorText });
      setEditing(false);
      setMsg('Đã cập nhật văn bản.');
    } catch (err) {
      setMsg(formatMutationError(err) || 'Lưu chỉnh sửa thất bại');
    }
  }, [jobId, editorText, patchMut]);

  const handleRetry = useCallback(async () => {
    if (!jobId) return;
    setMsg(null);
    try {
      await retryMut.mutateAsync(jobId);
    } catch (err) {
      setMsg(formatMutationError(err) || 'Thử lại thất bại');
    }
  }, [jobId, retryMut]);

  return (
    <div className="space-y-6 text-slate-900">
      <div className="rounded-xl border border-emerald-900/10 bg-white/90 p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-emerald-950">Lấy văn bản từ video</h2>
          <p className="mt-1 text-sm text-slate-600">
            Dán link YouTube, hoặc tải video/audio trực tiếp (tối đa{' '}
            {Math.round((job?.maxDurationSeconds || 30 * 60) / 60)} phút, 500MB). Facebook video/Reel:
            tải file về máy rồi upload — hệ thống không scrape Facebook. Chỉ xử lý video bạn sở hữu
            hoặc có quyền sử dụng.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <Label>Link YouTube / Facebook video hoặc Reel</Label>
            <Input
              placeholder="https://www.youtube.com/watch?v=… (Facebook: vui lòng upload file)"
              value={sourceUrl}
              disabled={busy || Boolean(file)}
              onChange={(e) => setSourceUrl(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Hoặc tải video/audio</Label>
            <div className="flex items-center gap-2">
              <Input
                type="file"
                accept="video/*,audio/*,.mp4,.mov,.webm,.mp3,.wav,.m4a"
                disabled={busy || Boolean(sourceUrl.trim())}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setFile(null)}
                  disabled={busy}
                >
                  Xóa
                </Button>
              ) : null}
            </div>
            {file ? (
              <p className="text-xs text-slate-500">
                <Upload className="mr-1 inline h-3 w-3" />
                {file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Ngôn ngữ</Label>
            <Select value={language} onValueChange={setLanguage} disabled={busy}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANG_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Tên riêng / Từ chuyên ngành</Label>
            <Textarea
              placeholder="Oneway, tên kênh, thương hiệu, địa danh… (cách nhau bằng dấu phẩy)"
              value={glossary}
              disabled={busy}
              onChange={(e) => setGlossary(e.target.value)}
              className="min-h-[72px] text-sm"
            />
            <p className="text-xs text-slate-500">
              Giúp nhận đúng tên thương hiệu/người. Lưu theo tài khoản để dùng lại.
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-end">
          <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
            <Checkbox
              checked={ownership}
              onCheckedChange={(v) => setOwnership(v === true)}
              disabled={busy}
              className="mt-0.5"
            />
            <span>
              Tôi xác nhận video thuộc quyền sở hữu của tôi hoặc tôi có quyền sử dụng hợp pháp.
              Không upload nội dung xâm phạm bản quyền.
            </span>
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            type="button"
            className="bg-orange-500 text-white hover:bg-orange-600"
            disabled={busy}
            onClick={() => void handleSubmit()}
          >
            {createMut.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="mr-2 h-4 w-4" />
            )}
            Lấy văn bản
          </Button>
          {job?.status === 'failed' ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void handleRetry()}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Thử lại
            </Button>
          ) : null}
        </div>
        {msg ? <p className="mt-3 text-sm text-amber-800">{msg}</p> : null}
      </div>

      {jobId ? (
        <div className="rounded-xl border border-emerald-900/10 bg-white/90 p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="font-semibold text-emerald-950">Tiến trình</h3>
            {isFetching && job?.status !== 'completed' && job?.status !== 'failed' ? (
              <Loader2 className="h-4 w-4 animate-spin text-emerald-700" />
            ) : null}
          </div>
          <ol className="space-y-2">
            {PROGRESS_STAGES.map((s, i) => {
              const done = job?.status === 'completed' || (idx >= 0 && i < idx);
              const active = idx === i && job?.status !== 'completed' && job?.status !== 'failed';
              const failed = job?.status === 'failed' && (idx === i || (idx < 0 && i === 0));
              return (
                <li
                  key={s}
                  className={`flex items-center gap-2 text-sm ${
                    done
                      ? 'text-emerald-800'
                      : active
                        ? 'font-medium text-orange-700'
                        : failed
                          ? 'text-red-700'
                          : 'text-slate-400'
                  }`}
                >
                  {done ? (
                    <Check className="h-4 w-4" />
                  ) : active ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <span className="inline-block h-4 w-4 rounded-full border border-current" />
                  )}
                  {VIDEO_TRANSCRIPTION_STAGE_LABELS[s]}
                </li>
              );
            })}
          </ol>
          {progressHint ? (
            <p className="mt-3 text-sm text-slate-600">
              {progressHint}
              {job?.durationSeconds != null ? ` · video ${Math.round(job.durationSeconds)}s` : ''}
              {job?.audioDurationSeconds != null
                ? ` · audio ${Math.round(job.audioDurationSeconds)}s`
                : ''}
              {job?.chunkCount != null
                ? ` · chunk ${job.chunksCompleted ?? 0}/${job.chunkCount}`
                : ''}
              {job?.processedDurationSeconds != null
                ? ` · đã xử lý ${Math.round(job.processedDurationSeconds)}s`
                : ''}
              {job?.resultCharCount != null ? ` · ${job.resultCharCount} ký tự` : ''}
            </p>
          ) : null}
          {job?.chunks && job.chunks.length > 0 ? (
            <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto text-xs text-slate-600">
              {job.chunks.map((c) => (
                <li key={c.index} className="flex flex-wrap items-center gap-2">
                  <span>
                    #{c.index} · {Math.round(c.startSec)}–{Math.round(c.endSec)}s · {c.status}
                    {c.charCount ? ` · ${c.charCount} ký tự` : ''}
                    {c.error ? ` · ${c.error}` : ''}
                  </span>
                  {c.status === 'failed' ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2"
                      disabled={busy}
                      onClick={() => {
                        if (!jobId) return;
                        void retryChunkMut.mutateAsync({ id: jobId, chunkIndex: c.index }).catch(
                          (err) => setMsg(formatMutationError(err) || 'Retry chunk thất bại'),
                        );
                      }}
                    >
                      Retry chunk
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {job?.status === 'completed' || editorText ? (
        <div className="rounded-xl border border-emerald-900/10 bg-white/90 p-5 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 font-semibold text-emerald-950">
              <FileText className="h-4 w-4" />
              Kết quả
            </h3>
            <div className="video-transcription-actions flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-white [&_svg]:text-white"
                onClick={() => void handleCopy()}
              >
                {copied ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
                Sao chép
              </Button>
              {!editing ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-white [&_svg]:text-white"
                  onClick={() => setEditing(true)}
                >
                  <Pencil className="mr-1 h-3.5 w-3.5" />
                  Chỉnh sửa
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-white [&_svg]:text-white"
                  disabled={busy}
                  onClick={() => void handleSaveEdit()}
                >
                  <Save className="mr-1 h-3.5 w-3.5" />
                  Lưu chỉnh sửa
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-white [&_svg]:text-white"
                onClick={handleWriteArticle}
              >
                <Sparkles className="mr-1 h-3.5 w-3.5" />
                Viết bài từ nội dung này
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-white [&_svg]:text-white"
                onClick={handleSave}
              >
                <Save className="mr-1 h-3.5 w-3.5" />
                Lưu văn bản
              </Button>
            </div>
          </div>
          <Textarea
            value={editorText}
            readOnly={!editing}
            onChange={(e) => setEditorText(e.target.value)}
            className="min-h-[280px] max-h-none font-sans text-sm leading-relaxed"
          />
          {job?.rawTranscript && editing === false ? (
            <details className="mt-3 text-xs text-slate-500">
              <summary className="cursor-pointer">Xem transcript thô (raw)</summary>
              <pre className="mt-2 whitespace-pre-wrap break-words rounded bg-slate-50 p-3">
                {job.rawTranscript}
              </pre>
            </details>
          ) : null}
        </div>
      ) : null}

      {/* Keep stage list referenced for tree-shaking safety with shared package */}
      <span className="hidden">{VIDEO_TRANSCRIPTION_STAGES.join(',')}</span>
    </div>
  );
}
