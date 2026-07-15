'use client';

import type { ReactNode } from 'react';
import { formatArticleForReadability } from '@/lib/format-article-readability';

/** Render bài viết spa — tiêu đề, đoạn, bullet, nhấn mạnh */
export function AdvancedArticleContent({ content }: { content: string }) {
  const formatted = formatArticleForReadability(content);

  if (!formatted?.trim()) {
    return <p className="text-sm text-muted-foreground">Không có nội dung.</p>;
  }

  const blocks = formatted.split(/\n\n+/);
  return (
    <div className="space-y-4 text-[15px] leading-[1.75] text-slate-800">
      {blocks.map((block, i) => {
        const trimmed = block.trim();
        if (!trimmed) return null;

        if (/^#{1,3}\s/.test(trimmed)) {
          const level = trimmed.match(/^(#+)/)?.[1]?.length ?? 2;
          const title = trimmed.replace(/^#+\s*/, '');
          if (level <= 2) {
            return (
              <h3
                key={i}
                className="text-base font-bold text-slate-900 border-b border-slate-200 pb-1.5 pt-1"
              >
                {title}
              </h3>
            );
          }
          return (
            <h4 key={i} className="text-sm font-semibold text-primary pt-1">
              {title}
            </h4>
          );
        }

        const lines = trimmed.split('\n').map((l) => l.trim()).filter(Boolean);
        const isList = lines.length > 0 && lines.every((l) => /^[-•*]\s/.test(l));

        if (isList) {
          return (
            <ul key={i} className="list-disc space-y-2 pl-5 marker:text-primary">
              {lines.map((line, j) => (
                <li key={j} className="pl-0.5">
                  {formatInlineEmphasis(line.replace(/^[-•*]\s*/, ''))}
                </li>
              ))}
            </ul>
          );
        }

        if (/^\*.*\*$/.test(trimmed) || trimmed.startsWith('Lưu ý:')) {
          return (
            <p key={i} className="rounded-md border border-amber-100 bg-amber-50/80 px-3 py-2 text-xs text-amber-900">
              {trimmed.replace(/^\*|\*$/g, '')}
            </p>
          );
        }

        if (/^⏰/.test(trimmed)) {
          return (
            <p key={i} className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
              {trimmed}
            </p>
          );
        }

        return (
          <p key={i} className="whitespace-pre-wrap">
            {formatInlineEmphasis(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

function formatInlineEmphasis(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}
