'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useBindFunnelChatbot } from '@/hooks/use-funnel-builder';
import type { FunnelCompleteSpec } from '@/types/funnel';

export function FunnelCapturePanel({
  recommendationId,
  spec,
  chatbotBotId,
}: {
  recommendationId: string;
  spec: FunnelCompleteSpec;
  chatbotBotId?: string | null;
}) {
  const bind = useBindFunnelChatbot();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [boundBotId, setBoundBotId] = useState<string | null>(chatbotBotId ?? null);
  const [embedCode, setEmbedCode] = useState<string | null>(null);

  const publicUrl = useMemo(() => {
    if (typeof window === 'undefined') return `/f/${recommendationId}`;
    return `${window.location.origin}/f/${recommendationId}`;
  }, [recommendationId]);

  async function onBind() {
    setError(null);
    setInfo(null);
    try {
      const res = await bind.mutateAsync({ id: recommendationId });
      setBoundBotId(res.botId);
      setEmbedCode(res.embed.embedCode);
      setInfo(`Đã gắn Chatbot CSKH “${res.botName}” theo kịch bản Funnel.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không gắn được chatbot');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Lead Form + Chatbot CSKH</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">Form công khai</div>
          <p className="mt-1 break-all font-mono text-xs">{publicUrl}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild>
              <a href={publicUrl} target="_blank" rel="noopener noreferrer">
                Mở Lead Form
              </a>
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void navigator.clipboard.writeText(publicUrl)}
            >
              Copy link
            </Button>
          </div>
        </div>

        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">
            Fields ({spec.leadForm.fields.length})
          </div>
          <ul className="list-disc pl-5">
            {spec.leadForm.fields.map((f) => (
              <li key={f.key}>
                {f.label} <Badge variant="outline">{f.type}</Badge>
                {f.required ? ' *' : ''}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">
            Chatbot flow — {spec.chatbotFlow.name}
          </div>
          <ol className="list-decimal space-y-1 pl-5">
            {spec.chatbotFlow.steps.map((s) => (
              <li key={s.id}>
                [{s.type}] {s.content}
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-muted-foreground">
            Gắn vào Chatbot CSKH hiện có (greeting + knowledge). Không tạo engine mới.
          </p>
          <Button size="sm" className="mt-2" onClick={onBind} disabled={bind.isPending}>
            {bind.isPending
              ? 'Đang gắn…'
              : boundBotId
                ? 'Cập nhật kịch bản chatbot'
                : 'Gắn Chatbot CSKH'}
          </Button>
          {boundBotId && (
            <p className="mt-1 text-xs">
              Bot ID: <span className="font-mono">{boundBotId}</span>
            </p>
          )}
        </div>

        {embedCode && (
          <pre className="max-h-40 overflow-auto rounded-md bg-muted/50 p-3 text-[11px] leading-relaxed">
            {embedCode}
          </pre>
        )}
        {error && <p className="text-destructive">{error}</p>}
        {info && <p className="text-green-700">{info}</p>}
      </CardContent>
    </Card>
  );
}
