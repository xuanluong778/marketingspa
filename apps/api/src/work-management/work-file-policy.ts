import { BadRequestException } from '@nestjs/common';
import { extname } from 'path';

export type WorkFileKind = 'image' | 'pdf' | 'doc' | 'sheet' | 'video' | 'zip';

const ALLOWED: Record<string, { kind: WorkFileKind; maxBytes: number; mimes: string[] }> = {
  '.jpg': { kind: 'image', maxBytes: 10 * 1024 * 1024, mimes: ['image/jpeg'] },
  '.jpeg': { kind: 'image', maxBytes: 10 * 1024 * 1024, mimes: ['image/jpeg'] },
  '.png': { kind: 'image', maxBytes: 10 * 1024 * 1024, mimes: ['image/png'] },
  '.gif': { kind: 'image', maxBytes: 10 * 1024 * 1024, mimes: ['image/gif'] },
  '.webp': { kind: 'image', maxBytes: 10 * 1024 * 1024, mimes: ['image/webp'] },
  '.pdf': { kind: 'pdf', maxBytes: 25 * 1024 * 1024, mimes: ['application/pdf'] },
  '.doc': {
    kind: 'doc',
    maxBytes: 25 * 1024 * 1024,
    mimes: ['application/msword', 'application/octet-stream'],
  },
  '.docx': {
    kind: 'doc',
    maxBytes: 25 * 1024 * 1024,
    mimes: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/octet-stream',
    ],
  },
  '.xls': {
    kind: 'sheet',
    maxBytes: 25 * 1024 * 1024,
    mimes: ['application/vnd.ms-excel', 'application/octet-stream'],
  },
  '.xlsx': {
    kind: 'sheet',
    maxBytes: 25 * 1024 * 1024,
    mimes: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream',
    ],
  },
  '.mp4': { kind: 'video', maxBytes: 100 * 1024 * 1024, mimes: ['video/mp4'] },
  '.webm': { kind: 'video', maxBytes: 100 * 1024 * 1024, mimes: ['video/webm'] },
  '.mov': {
    kind: 'video',
    maxBytes: 100 * 1024 * 1024,
    mimes: ['video/quicktime', 'video/mp4', 'application/octet-stream'],
  },
  '.zip': {
    kind: 'zip',
    maxBytes: 50 * 1024 * 1024,
    mimes: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
  },
};

/** Block double extension / path tricks */
export function sanitizeOriginalName(name: string): string {
  const base = name.replace(/[/\\]/g, '_').replace(/\0/g, '').trim();
  if (!base || base === '.' || base === '..') {
    throw new BadRequestException('Tên file không hợp lệ');
  }
  return base.slice(0, 500);
}

export function classifyWorkUpload(originalName: string, mimeType?: string, size?: number) {
  const safeName = sanitizeOriginalName(originalName || 'file');
  const ext = extname(safeName).toLowerCase();
  const rule = ALLOWED[ext];
  if (!rule) {
    throw new BadRequestException(
      'Loại file không được phép. Cho phép: ảnh, PDF, Word, Excel, video (mp4/webm/mov), ZIP',
    );
  }
  const bytes = size ?? 0;
  if (bytes <= 0) {
    throw new BadRequestException('File rỗng');
  }
  if (bytes > rule.maxBytes) {
    throw new BadRequestException(
      `File vượt dung lượng tối đa ${(rule.maxBytes / (1024 * 1024)).toFixed(0)}MB cho loại ${rule.kind}`,
    );
  }
  const mime = (mimeType || 'application/octet-stream').toLowerCase();
  // Reject obviously wrong magic/mismatch for images/pdf/video when browser reports well-known types
  if (mime && mime !== 'application/octet-stream' && !rule.mimes.includes(mime)) {
    // some browsers send image/jpg
    if (!(rule.kind === 'image' && mime === 'image/jpg')) {
      throw new BadRequestException(`MIME type không khớp với phần mở rộng (${mime})`);
    }
  }
  return { ext, kind: rule.kind, maxBytes: rule.maxBytes, originalName: safeName, mime };
}

export const WORK_UPLOAD_MAX_BYTES = 100 * 1024 * 1024;
