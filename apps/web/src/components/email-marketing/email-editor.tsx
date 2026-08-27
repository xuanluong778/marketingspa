'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Heading1,
  Image as ImageIcon,
  Minus,
  Monitor,
  MousePointerClick,
  Share2,
  Smartphone,
  Sparkles,
  Square,
  Trash2,
  Type,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { ApiError } from '@/lib/api-client';
import {
  useGenerateEmailContent,
  useSendTestEmail,
} from '@/hooks/use-email-marketing';
import {
  MERGE_TAGS,
  type EmailBlock,
  type EmailBlockType,
  blocksFromGenerated,
  compileEmailHtml,
  createBlock,
  previewEmailHtml,
  wrapEmailPreviewSrcDoc,
} from '@/lib/email-editor';
import { useT } from '@/i18n/i18n-provider';

const ADD_BLOCKS: { type: EmailBlockType; label: string; icon: typeof Type }[] = [
  { type: 'text', label: 'Text', icon: Type },
  { type: 'heading', label: 'Heading', icon: Heading1 },
  { type: 'image', label: 'Image', icon: ImageIcon },
  { type: 'button', label: 'Button CTA', icon: MousePointerClick },
  { type: 'divider', label: 'Divider', icon: Minus },
  { type: 'spacer', label: 'Spacer', icon: Square },
  { type: 'social', label: 'Social', icon: Share2 },
  { type: 'footer', label: 'Footer', icon: Type },
];

function errorMessage(err: unknown, fallback: string) {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

export function EmailEditor({
  subject,
  previewText,
  blocks,
  onSubjectChange,
  onPreviewTextChange,
  onBlocksChange,
  extraTop,
}: {
  subject: string;
  previewText: string;
  blocks: EmailBlock[];
  onSubjectChange: (value: string) => void;
  onPreviewTextChange: (value: string) => void;
  onBlocksChange: (blocks: EmailBlock[]) => void;
  extraTop?: ReactNode;
}) {
  const t = useT();
  const generate = useGenerateEmailContent();
  const sendTest = useSendTestEmail();
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [testOpen, setTestOpen] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionOk, setActionOk] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(blocks[0]?.id ?? null);

  const previewSrc = useMemo(
    () => wrapEmailPreviewSrcDoc(previewEmailHtml(blocks, previewText)),
    [blocks, previewText],
  );

  function updateBlock(id: string, patch: Partial<EmailBlock>) {
    onBlocksChange(blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as EmailBlock) : b)));
  }

  function moveBlock(index: number, dir: -1 | 1) {
    const next = index + dir;
    if (next < 0 || next >= blocks.length) return;
    const copy = [...blocks];
    const [item] = copy.splice(index, 1);
    copy.splice(next, 0, item);
    onBlocksChange(copy);
  }

  function insertTag(tag: string) {
    const token = `{{${tag}}}`;
    const target = blocks.find((b) => b.id === selectedId) || blocks.find((b) => 'text' in b);
    if (!target) return;
    if (target.type === 'heading' || target.type === 'text' || target.type === 'footer') {
      updateBlock(target.id, { text: `${target.text}${target.text ? ' ' : ''}${token}` });
      setSelectedId(target.id);
    } else if (target.type === 'button') {
      updateBlock(target.id, { label: `${target.label} ${token}` });
      setSelectedId(target.id);
    }
  }

  async function applyAi() {
    setActionError(null);
    try {
      const result = await generate.mutateAsync({ prompt: aiPrompt.trim() });
      onSubjectChange(result.subject);
      onPreviewTextChange(result.previewText);
      const next = blocksFromGenerated(result);
      onBlocksChange(next);
      setSelectedId(next[0]?.id ?? null);
      setAiOpen(false);
      setActionOk('Đã điền Subject, Preheader, nội dung và CTA.');
    } catch (err) {
      setActionError(errorMessage(err, t('emailMarketing.actionFailed')));
    }
  }

  async function sendTestEmail() {
    setActionError(null);
    setActionOk(null);
    try {
      await sendTest.mutateAsync({
        to: testTo.trim(),
        subject: subject.trim() || 'Email thử',
        previewText: previewText.trim() || undefined,
        htmlBody: compileEmailHtml(blocks, previewText),
      });
      setTestOpen(false);
      setActionOk(`Đã gửi email thử tới ${testTo.trim()}.`);
    } catch (err) {
      setActionError(errorMessage(err, t('emailMarketing.actionFailed')));
    }
  }

  return (
    <div className="space-y-4">
      {extraTop}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => { setActionError(null); setAiOpen(true); }}>
          <Sparkles className="h-4 w-4" /> Tạo nội dung bằng AI
        </Button>
        <Button type="button" variant="outline" onClick={() => { setActionError(null); setTestOpen(true); }}>
          Gửi Email thử
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Subject</Label>
          <Input
            value={subject}
            onChange={(e) => onSubjectChange(e.target.value)}
            placeholder="Tiêu đề người nhận nhìn thấy"
          />
        </div>
        <div className="space-y-1">
          <Label>Preheader</Label>
          <Input
            value={previewText}
            onChange={(e) => onPreviewTextChange(e.target.value)}
            placeholder="Dòng xem trước trong hộp thư"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Chèn biến:</span>
        {MERGE_TAGS.map((t) => (
          <Button key={t.key} type="button" size="sm" variant="outline" onClick={() => insertTag(t.key)}>
            {`{{${t.key}}}`}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {ADD_BLOCKS.map((b) => (
          <Button
            key={b.type}
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              const next = createBlock(b.type);
              onBlocksChange([...blocks, next]);
              setSelectedId(next.id);
            }}
          >
            <b.icon className="h-3.5 w-3.5" /> {b.label}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          {blocks.map((block, index) => (
            <div
              key={block.id}
              className={cn(
                'rounded-lg border p-3',
                selectedId === block.id ? 'border-primary' : 'hover:bg-muted/20',
              )}
              onClick={() => setSelectedId(block.id)}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {block.type}
                </span>
                <div className="flex gap-1">
                  <Button type="button" size="icon" variant="ghost" onClick={() => moveBlock(index, -1)}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" size="icon" variant="ghost" onClick={() => moveBlock(index, 1)}>
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => onBlocksChange(blocks.filter((b) => b.id !== block.id))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <BlockFields block={block} onChange={(patch) => updateBlock(block.id, patch)} />
            </div>
          ))}
          {!blocks.length && (
            <p className="text-sm text-muted-foreground">Chọn một block ở trên để bắt đầu soạn.</p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Xem trước</Label>
            <div className="flex gap-1">
              <Button
                type="button"
                size="sm"
                variant={device === 'desktop' ? 'default' : 'outline'}
                onClick={() => setDevice('desktop')}
              >
                <Monitor className="h-3.5 w-3.5" /> Desktop
              </Button>
              <Button
                type="button"
                size="sm"
                variant={device === 'mobile' ? 'default' : 'outline'}
                onClick={() => setDevice('mobile')}
              >
                <Smartphone className="h-3.5 w-3.5" /> Mobile
              </Button>
            </div>
          </div>
          <div className="flex justify-center rounded-md border bg-muted/40 p-3">
            <iframe
              title="Xem trước email"
              sandbox=""
              className="h-[420px] rounded-md border bg-white"
              style={{ width: device === 'desktop' ? 600 : 375, maxWidth: '100%' }}
              srcDoc={previewSrc}
            />
          </div>
        </div>
      </div>

      {actionOk && <p className="text-sm text-muted-foreground">{actionOk}</p>}
      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tạo nội dung bằng AI</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Mô tả ngắn email muốn gửi. AI sẽ tạo Subject, Preheader, nội dung và nút CTA.
          </p>
          <Textarea
            rows={5}
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="Ví dụ: Ưu đãi 30% liệu trình giảm béo tuần này, kêu gọi đặt lịch."
          />
          {actionError && aiOpen && <p className="text-sm text-destructive">{actionError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAiOpen(false)}>
              Hủy
            </Button>
            <Button
              type="button"
              onClick={() => void applyAi()}
              disabled={generate.isPending || aiPrompt.trim().length < 3}
            >
              {generate.isPending ? 'Đang tạo…' : 'Tạo nội dung'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gửi Email thử</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <Label>Gửi tới</Label>
            <Input
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          {actionError && testOpen && <p className="text-sm text-destructive">{actionError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTestOpen(false)}>
              Hủy
            </Button>
            <Button
              type="button"
              onClick={() => void sendTestEmail()}
              disabled={sendTest.isPending || !testTo.includes('@')}
            >
              {sendTest.isPending ? 'Đang gửi…' : 'Gửi thử'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BlockFields({
  block,
  onChange,
}: {
  block: EmailBlock;
  onChange: (patch: Partial<EmailBlock>) => void;
}) {
  switch (block.type) {
    case 'heading':
      return (
        <Input value={block.text} onChange={(e) => onChange({ text: e.target.value } as Partial<EmailBlock>)} />
      );
    case 'footer':
      return (
        <Textarea
          rows={3}
          value={block.text}
          onChange={(e) => onChange({ text: e.target.value } as Partial<EmailBlock>)}
        />
      );
    case 'text':
      return (
        <Textarea
          rows={4}
          value={block.text}
          onChange={(e) => onChange({ text: e.target.value } as Partial<EmailBlock>)}
        />
      );
    case 'image':
      return (
        <div className="space-y-2">
          <Input
            placeholder="URL hình ảnh https://..."
            value={block.src}
            onChange={(e) => onChange({ src: e.target.value } as Partial<EmailBlock>)}
          />
          <Input
            placeholder="Mô tả hình"
            value={block.alt}
            onChange={(e) => onChange({ alt: e.target.value } as Partial<EmailBlock>)}
          />
        </div>
      );
    case 'button':
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            placeholder="Chữ trên nút"
            value={block.label}
            onChange={(e) => onChange({ label: e.target.value } as Partial<EmailBlock>)}
          />
          <Input
            placeholder="https://..."
            value={block.url}
            onChange={(e) => onChange({ url: e.target.value } as Partial<EmailBlock>)}
          />
        </div>
      );
    case 'spacer':
      return (
        <Input
          type="number"
          min={8}
          max={80}
          value={block.height}
          onChange={(e) => onChange({ height: Number(e.target.value) || 24 } as Partial<EmailBlock>)}
        />
      );
    case 'social':
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            placeholder="Facebook URL"
            value={block.facebook}
            onChange={(e) => onChange({ facebook: e.target.value } as Partial<EmailBlock>)}
          />
          <Input
            placeholder="Instagram URL"
            value={block.instagram}
            onChange={(e) => onChange({ instagram: e.target.value } as Partial<EmailBlock>)}
          />
          <Input
            placeholder="YouTube URL"
            value={block.youtube}
            onChange={(e) => onChange({ youtube: e.target.value } as Partial<EmailBlock>)}
          />
          <Input
            placeholder="TikTok URL"
            value={block.tiktok}
            onChange={(e) => onChange({ tiktok: e.target.value } as Partial<EmailBlock>)}
          />
        </div>
      );
    default:
      return null;
  }
}
