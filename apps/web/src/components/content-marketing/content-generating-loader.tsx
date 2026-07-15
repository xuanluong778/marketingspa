'use client';

import { Loader2 } from 'lucide-react';

export interface ContentGeneratingLoaderProps {
  title?: string;
  subtitle?: string;
}

/** Loading lớn cột phải khi AI đang viết bài */
export function ContentGeneratingLoader({
  title = 'Đang viết bài',
  subtitle = 'AI đang tạo nội dung — vui lòng đợi trong giây lát',
}: ContentGeneratingLoaderProps) {
  return (
    <div className="rounded-xl border bg-card p-8 md:p-12 flex flex-col items-center justify-center min-h-[min(480px,70vh)] gap-5">
      <Loader2 className="h-20 w-20 animate-spin text-primary" strokeWidth={1.5} />
      <div className="text-center space-y-2">
        <p className="text-lg font-semibold text-slate-800">{title}</p>
        <p className="text-sm text-muted-foreground max-w-xs">{subtitle}</p>
      </div>
    </div>
  );
}
