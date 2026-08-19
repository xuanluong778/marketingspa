export const MERGE_TAGS = [
  { key: 'firstName', label: 'Tên' },
  { key: 'email', label: 'Email' },
  { key: 'company', label: 'Công ty' },
] as const;

export type EmailMergeKey = (typeof MERGE_TAGS)[number]['key'];

export type EmailBlockType =
  | 'heading'
  | 'text'
  | 'image'
  | 'button'
  | 'divider'
  | 'spacer'
  | 'social'
  | 'footer';

export type EmailBlock =
  | { id: string; type: 'heading'; text: string }
  | { id: string; type: 'text'; text: string }
  | { id: string; type: 'image'; src: string; alt: string }
  | { id: string; type: 'button'; label: string; url: string }
  | { id: string; type: 'divider' }
  | { id: string; type: 'spacer'; height: number }
  | { id: string; type: 'social'; facebook: string; instagram: string; youtube: string; tiktok: string }
  | { id: string; type: 'footer'; text: string };

export type EmailEditorDocument = { v: 1; blocks: EmailBlock[] };

export const SAMPLE_MERGE_VARS: Record<string, string> = {
  firstName: 'An',
  name: 'Nguyễn An',
  email: 'an@example.com',
  company: 'Spa An Nhiên',
};

const MARKER = 'EMAIL_EDITOR_V1:';

export function newBlockId() {
  return `b-${Math.random().toString(36).slice(2, 10)}`;
}

export function defaultEmailBlocks(): EmailBlock[] {
  return [
    { id: newBlockId(), type: 'heading', text: 'Xin chào {{firstName}},' },
    {
      id: newBlockId(),
      type: 'text',
      text: 'Cảm ơn bạn đã quan tâm. Đây là vài dòng dành riêng cho bạn tại {{company}}.',
    },
    { id: newBlockId(), type: 'button', label: 'Đặt lịch ngay', url: 'https://marketingautoaz.com' },
    { id: newBlockId(), type: 'divider' },
    {
      id: newBlockId(),
      type: 'footer',
      text: 'Bạn nhận email này vì đã để lại thông tin liên hệ.\n{{company}}',
    },
  ];
}

export function createBlock(type: EmailBlockType): EmailBlock {
  const id = newBlockId();
  switch (type) {
    case 'heading':
      return { id, type, text: 'Tiêu đề' };
    case 'text':
      return { id, type, text: 'Viết nội dung tại đây. Dùng {{firstName}} để hiện tên khách.' };
    case 'image':
      return { id, type, src: '', alt: 'Hình minh họa' };
    case 'button':
      return { id, type, label: 'Gọi hành động', url: 'https://' };
    case 'divider':
      return { id, type };
    case 'spacer':
      return { id, type, height: 24 };
    case 'social':
      return { id, type, facebook: '', instagram: '', youtube: '', tiktok: '' };
    case 'footer':
      return { id, type, text: '{{company}}\nNếu không muốn nhận email nữa, hãy hủy đăng ký.' };
  }
}

export type GeneratedEmailContent = {
  subject: string;
  previewText: string;
  heading: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  footer?: string;
};

export function blocksFromGenerated(content: GeneratedEmailContent): EmailBlock[] {
  const blocks: EmailBlock[] = [];
  if (content.heading.trim()) {
    blocks.push({ id: newBlockId(), type: 'heading', text: content.heading.trim() });
  }
  if (content.body.trim()) {
    blocks.push({ id: newBlockId(), type: 'text', text: content.body.trim() });
  }
  if (content.ctaLabel.trim()) {
    blocks.push({
      id: newBlockId(),
      type: 'button',
      label: content.ctaLabel.trim(),
      url: content.ctaUrl.trim() || 'https://marketingautoaz.com',
    });
  }
  blocks.push({ id: newBlockId(), type: 'divider' });
  blocks.push({
    id: newBlockId(),
    type: 'footer',
    text:
      content.footer?.trim() ||
      'Bạn nhận email này vì đã để lại thông tin liên hệ.\n{{company}}',
  });
  return blocks;
}

export function renderMerge(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => vars[key] ?? '');
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return '';
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) return trimmed;
  return `https://${trimmed.replace(/^\/+/, '')}`;
}

function cell(inner: string, extra = '') {
  return `<tr><td style="padding:8px 28px;${extra}">${inner}</td></tr>`;
}

function compileBlock(block: EmailBlock): string {
  switch (block.type) {
    case 'heading':
      return cell(
        `<h1 style="margin:0;font-size:22px;line-height:1.3;color:#111827;font-family:Arial,sans-serif">${escapeHtml(block.text)}</h1>`,
        'padding-top:24px',
      );
    case 'text':
      return cell(
        `<p style="margin:0;font-size:16px;line-height:1.6;color:#374151;font-family:Arial,sans-serif;white-space:pre-line">${escapeHtml(block.text)}</p>`,
      );
    case 'image':
      if (!block.src.trim()) return '';
      return cell(
        `<img src="${escapeHtml(safeUrl(block.src))}" alt="${escapeHtml(block.alt || '')}" style="display:block;max-width:100%;height:auto;border:0" />`,
      );
    case 'button': {
      const href = escapeHtml(safeUrl(block.url) || '#');
      const label = escapeHtml(block.label || 'Xem thêm');
      return cell(
        `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px auto"><tr><td style="border-radius:8px;background:#111827"><a href="${href}" style="display:inline-block;padding:12px 22px;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:15px;font-weight:bold">${label}</a></td></tr></table>`,
        'text-align:center;padding-top:12px;padding-bottom:12px',
      );
    }
    case 'divider':
      return cell(
        `<hr style="border:none;border-top:1px solid #e5e7eb;margin:8px 0" />`,
      );
    case 'spacer':
      return `<tr><td style="height:${Math.min(80, Math.max(8, block.height))}px;line-height:${Math.min(80, Math.max(8, block.height))}px;font-size:1px">&nbsp;</td></tr>`;
    case 'social': {
      const links = [
        block.facebook && { href: block.facebook, label: 'Facebook' },
        block.instagram && { href: block.instagram, label: 'Instagram' },
        block.youtube && { href: block.youtube, label: 'YouTube' },
        block.tiktok && { href: block.tiktok, label: 'TikTok' },
      ].filter(Boolean) as { href: string; label: string }[];
      if (!links.length) return '';
      const html = links
        .map(
          (l) =>
            `<a href="${escapeHtml(safeUrl(l.href))}" style="color:#111827;text-decoration:underline;margin:0 8px;font-family:Arial,sans-serif;font-size:13px">${l.label}</a>`,
        )
        .join('');
      return cell(`<p style="margin:0;text-align:center">${html}</p>`);
    }
    case 'footer':
      return cell(
        `<p style="margin:0;font-size:12px;line-height:1.5;color:#6b7280;font-family:Arial,sans-serif;white-space:pre-line;text-align:center">${escapeHtml(block.text)}</p>`,
        'padding-bottom:28px',
      );
  }
}

export function compileEmailHtml(blocks: EmailBlock[], previewText?: string): string {
  const doc: EmailEditorDocument = { v: 1, blocks };
  const marker = `<!--${MARKER}${encodeURIComponent(JSON.stringify(doc))}-->`;
  const preheader = previewText?.trim()
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(previewText.trim())}</div>`
    : '';
  const rows = blocks.map(compileBlock).join('');
  const inner = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5"><tr><td align="center" style="padding:24px 12px">${preheader}<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px">${rows}</table></td></tr></table>`;
  return `${marker}\n${inner}`;
}

export function parseEmailHtml(html: string | undefined | null): EmailBlock[] {
  if (!html?.trim()) return defaultEmailBlocks();
  const match = html.match(/<!--EMAIL_EDITOR_V1:([\s\S]*?)-->/);
  if (match?.[1]) {
    try {
      const parsed = JSON.parse(decodeURIComponent(match[1])) as EmailEditorDocument;
      if (parsed?.v === 1 && Array.isArray(parsed.blocks) && parsed.blocks.length) {
        return parsed.blocks;
      }
    } catch {
      /* fall through */
    }
  }
  const text = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
  return [
    {
      id: newBlockId(),
      type: 'text',
      text: text || 'Viết nội dung tại đây.',
    },
  ];
}

export function previewEmailHtml(
  blocks: EmailBlock[],
  previewText?: string,
  vars: Record<string, string> = SAMPLE_MERGE_VARS,
) {
  return renderMerge(compileEmailHtml(blocks, previewText), vars);
}

export function wrapEmailPreviewSrcDoc(innerHtml: string) {
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body style="margin:0;background:#f4f4f5">${innerHtml}</body></html>`;
}
