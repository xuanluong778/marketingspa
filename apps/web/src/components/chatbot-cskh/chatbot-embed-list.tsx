'use client';

import { useCallback, useState } from 'react';
import { Copy, Check, Trash2, Play, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState, LoadingState } from '@/components/shared/page-state';
import { BOT_STATUS_LABELS, type ChatbotBot, type ChatbotBotStatus } from '@/types/chatbot-cskh';
import { copyToClipboard } from '@/lib/copy-to-clipboard';

interface ChatbotEmbedListProps {
  bots: ChatbotBot[] | undefined;
  isLoading: boolean;
  selectedBotId: string | null;
  embedCode?: string;
  onSelectBot: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (bot: ChatbotBot) => void;
  onUpdateStatus?: (id: string, status: ChatbotBotStatus) => void;
  statusChangingId?: string | null;
}

export function ChatbotEmbedList({
  bots,
  isLoading,
  selectedBotId,
  embedCode,
  onSelectBot,
  onDelete,
  onEdit,
  onUpdateStatus,
  statusChangingId,
}: ChatbotEmbedListProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);

  const activeBot = bots?.find((b) => b.id === selectedBotId) ?? bots?.[0];
  const code = embedCode ?? activeBot?.embedCode ?? '';

  const handleCopy = useCallback(async (text: string, key: string) => {
    setCopyError(null);
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 2000);
    } else {
      setCopyError('Không copy được. Hãy chọn và copy thủ công từ ô mã bên trên.');
    }
  }, []);

  return (
    <div className="space-y-6 pt-4 border-t">
      <section className="rounded-lg border bg-[#0B2115] text-white p-5 space-y-3">
        <h3 className="font-semibold text-lg">Mã nhúng website</h3>
        <p className="text-sm text-white/75">
          Dán đoạn mã sau trước thẻ <code className="text-white/90">&lt;/body&gt;</code> trên
          website. Kích hoạt chatbot trước khi widget hiển thị cho khách.
        </p>
        <p className="text-sm text-amber-200/90">
          Website HTTPS cần <strong>plugin proxy WordPress</strong> trên server (chưa cài → widget 404).
          Cài file <code className="text-white/90">scripts/chatbot-embed-proxy/mspa-chatbot-proxy.zip</code>{' '}
          qua WP Admin → Plugins → Add New → Upload. Kích hoạt plugin → Settings → MarketingSpa Chatbot →
          nhập URL API. Vào Settings → Permalinks → Save để refresh rewrite.
        </p>

        {bots && bots.length > 1 && (
          <div className="flex items-center gap-2 max-w-xs">
            <Label className="text-white/80 shrink-0">Chatbot:</Label>
            <Select value={activeBot?.id ?? ''} onValueChange={onSelectBot}>
              <SelectTrigger className="bg-white/10 border-white/20 text-white">
                <SelectValue placeholder="Chọn bot" />
              </SelectTrigger>
              <SelectContent>
                {bots.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.botName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {code ? (
          <>
            <pre
              className="rounded-md bg-black/40 border border-white/10 p-4 text-xs overflow-x-auto whitespace-pre-wrap text-emerald-100 select-all cursor-text"
              onClick={(e) => {
                const el = e.currentTarget;
                const range = document.createRange();
                range.selectNodeContents(el);
                const sel = window.getSelection();
                sel?.removeAllRanges();
                sel?.addRange(range);
              }}
            >
              {code}
            </pre>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="bg-white/15 text-white hover:bg-white/25 border-0"
                onClick={() => void handleCopy(code, 'main')}
              >
                {copiedKey === 'main' ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Đã copy!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy mã nhúng
                  </>
                )}
              </Button>
              {copiedKey === 'main' && (
                <span className="text-sm text-emerald-300">Mã đã được sao chép vào clipboard.</span>
              )}
            </div>
            {copyError && <p className="text-sm text-amber-300">{copyError}</p>}
          </>
        ) : (
          <p className="text-sm text-white/60">Tạo và kích hoạt chatbot để lấy mã nhúng.</p>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold text-lg">Danh sách chatbot</h3>

        {isLoading && <LoadingState />}

        {!isLoading && (!bots || bots.length === 0) && (
          <EmptyState title="Chưa có chatbot" description="Nhấn Tạo chatbot để bắt đầu" />
        )}

        {!isLoading && bots && bots.length > 0 && (
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#0B2115] hover:bg-[#0B2115]">
                  <TableHead className="text-white font-semibold">TÊN</TableHead>
                  <TableHead className="text-white font-semibold">WEBSITE</TableHead>
                  <TableHead className="text-white font-semibold">TRẠNG THÁI</TableHead>
                  <TableHead className="text-white font-semibold text-right">THAO TÁC</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bots.map((bot) => (
                  <TableRow
                    key={bot.id}
                    className={selectedBotId === bot.id ? 'bg-muted/50' : undefined}
                    onClick={() => onSelectBot(bot.id)}
                  >
                    <TableCell className="font-medium">{bot.botName}</TableCell>
                    <TableCell className="text-muted-foreground max-w-[240px] truncate">
                      {bot.websiteUrl || '—'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          bot.status === 'ACTIVE'
                            ? 'border-emerald-500 text-emerald-600 bg-emerald-50'
                            : bot.status === 'PAUSED'
                              ? 'border-amber-500 text-amber-600 bg-amber-50'
                              : ''
                        }
                      >
                        {bot.status === 'ACTIVE' ? 'ACTIVE' : BOT_STATUS_LABELS[bot.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                        {bot.status !== 'ACTIVE' && onUpdateStatus && (
                          <Button
                            type="button"
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            disabled={statusChangingId === bot.id}
                            onClick={() => onUpdateStatus(bot.id, 'ACTIVE')}
                          >
                            <Play className="h-3 w-3 mr-1" />
                            Kích hoạt
                          </Button>
                        )}
                        {bot.status === 'ACTIVE' && onUpdateStatus && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="border-amber-500 text-amber-700 hover:bg-amber-50"
                            disabled={statusChangingId === bot.id}
                            onClick={() => onUpdateStatus(bot.id, 'PAUSED')}
                          >
                            <Pause className="h-3 w-3 mr-1" />
                            Tạm dừng
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-primary"
                          disabled={!bot.embedCode}
                          onClick={() => bot.embedCode && void handleCopy(bot.embedCode, bot.id)}
                        >
                          {copiedKey === bot.id ? (
                            <>
                              <Check className="h-3 w-3 mr-1" />
                              Đã copy
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3 mr-1" />
                              Copy mã
                            </>
                          )}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => onEdit(bot)}
                        >
                          Sửa
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="text-destructive border-destructive/40 hover:bg-destructive/10"
                          onClick={() => onDelete(bot.id)}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Xóa
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
