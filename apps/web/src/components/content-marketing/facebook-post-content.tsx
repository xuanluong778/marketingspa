'use client';

import { formatArticleForFacebookPost } from '@/lib/format-article-readability';

/** Hiển thị bài Facebook — văn liền mạch, sẵn sàng copy */
export function FacebookPostContent({ content }: { content: string }) {
  const formatted = formatArticleForFacebookPost(content);

  if (!formatted?.trim()) {
    return <p className="text-sm text-muted-foreground">Không có nội dung.</p>;
  }

  return (
    <div className="text-[15px] leading-[1.85] text-slate-800 whitespace-pre-wrap">
      {formatted}
    </div>
  );
}

/** Ghép hook + bài + CTA + hashtag để đăng Facebook */
export function buildFacebookPostText(parts: {
  hook?: string;
  body: string;
  cta?: string;
  hashtags?: string[];
}): string {
  return [
    parts.hook?.trim(),
    formatArticleForFacebookPost(parts.body),
    parts.cta?.trim(),
    parts.hashtags?.length ? parts.hashtags.join(' ') : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}
