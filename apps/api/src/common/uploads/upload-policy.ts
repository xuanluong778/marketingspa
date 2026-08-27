/**
 * Shared upload validation — MIME + extension allowlist, size, safe names.
 * Controllers must use createUploadMulterOptions / assertUploadFile — no bypass.
 */
import { BadRequestException } from '@nestjs/common';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { memoryStorage } from 'multer';

export type UploadProfile =
  | 'image'
  | 'document'
  | 'spreadsheet'
  | 'media'
  | 'work'
  | 'diagram'
  | 'kb_text'
  | 'video_transcription';

type Rule = {
  maxBytes: number;
  mimes: string[];
};

const BLOCKED_EXT = new Set([
  '.exe',
  '.sh',
  '.bat',
  '.cmd',
  '.com',
  '.msi',
  '.dll',
  '.js',
  '.mjs',
  '.cjs',
  '.php',
  '.py',
  '.rb',
  '.pl',
  '.cgi',
  '.html',
  '.htm',
  '.svg',
  '.jsp',
  '.asp',
  '.aspx',
  '.htaccess',
]);

const EXT_RULES: Record<string, Rule> = {
  '.jpg': { maxBytes: 10 * 1024 * 1024, mimes: ['image/jpeg', 'image/jpg'] },
  '.jpeg': { maxBytes: 10 * 1024 * 1024, mimes: ['image/jpeg', 'image/jpg'] },
  '.png': { maxBytes: 10 * 1024 * 1024, mimes: ['image/png'] },
  '.gif': { maxBytes: 10 * 1024 * 1024, mimes: ['image/gif'] },
  '.webp': { maxBytes: 10 * 1024 * 1024, mimes: ['image/webp'] },
  '.pdf': { maxBytes: 25 * 1024 * 1024, mimes: ['application/pdf'] },
  '.doc': { maxBytes: 25 * 1024 * 1024, mimes: ['application/msword', 'application/octet-stream'] },
  '.docx': {
    maxBytes: 25 * 1024 * 1024,
    mimes: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/octet-stream',
    ],
  },
  '.xls': {
    maxBytes: 25 * 1024 * 1024,
    mimes: ['application/vnd.ms-excel', 'application/octet-stream'],
  },
  '.xlsx': {
    maxBytes: 25 * 1024 * 1024,
    mimes: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream',
    ],
  },
  '.csv': { maxBytes: 10 * 1024 * 1024, mimes: ['text/csv', 'application/vnd.ms-excel', 'text/plain', 'application/octet-stream'] },
  '.txt': { maxBytes: 2 * 1024 * 1024, mimes: ['text/plain', 'application/octet-stream'] },
  '.mp4': { maxBytes: 100 * 1024 * 1024, mimes: ['video/mp4'] },
  '.webm': { maxBytes: 100 * 1024 * 1024, mimes: ['video/webm'] },
  '.mov': {
    maxBytes: 100 * 1024 * 1024,
    mimes: ['video/quicktime', 'video/mp4', 'application/octet-stream'],
  },
  '.mp3': { maxBytes: 50 * 1024 * 1024, mimes: ['audio/mpeg', 'audio/mp3'] },
  '.wav': { maxBytes: 50 * 1024 * 1024, mimes: ['audio/wav', 'audio/x-wav', 'audio/wave'] },
  '.zip': {
    maxBytes: 50 * 1024 * 1024,
    mimes: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
  },
};

const PROFILE_EXTS: Record<UploadProfile, string[]> = {
  image: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
  document: ['.pdf', '.doc', '.docx', '.txt'],
  spreadsheet: ['.csv', '.xls', '.xlsx'],
  media: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.webm', '.mov'],
  work: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.mp4', '.webm', '.mov', '.zip'],
  diagram: ['.txt', '.png', '.jpg', '.jpeg', '.webp', '.pdf'],
  kb_text: ['.txt', '.pdf', '.md', '.csv'],
  video_transcription: ['.mp4', '.webm', '.mov', '.mp3', '.wav'],
};

// Allow .md for kb via temporary rule
EXT_RULES['.md'] = { maxBytes: 2 * 1024 * 1024, mimes: ['text/markdown', 'text/plain', 'application/octet-stream'] };

const PROFILE_MAX: Record<UploadProfile, number> = {
  image: 10 * 1024 * 1024,
  document: 25 * 1024 * 1024,
  spreadsheet: 10 * 1024 * 1024,
  media: 25 * 1024 * 1024,
  work: 100 * 1024 * 1024,
  diagram: 2 * 1024 * 1024,
  kb_text: 2 * 1024 * 1024,
  video_transcription: Math.max(
    50 * 1024 * 1024,
    Number(process.env.VIDEO_TRANSCRIPTION_MAX_FILE_BYTES) || 500 * 1024 * 1024,
  ),
};

/** Public-safe media prefix under uploads/ (no JWT; images only). */
export const PUBLIC_UPLOAD_PREFIX = 'public/';

export const SERVE_ALLOWED_EXT = new Set(Object.keys(EXT_RULES));
export const SERVE_BLOCKED_EXT = BLOCKED_EXT;
export const PUBLIC_MEDIA_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

export function sanitizeOriginalName(name: string): string {
  const base = String(name || 'file')
    .replace(/[/\\]/g, '_')
    .replace(/\0/g, '')
    .trim();
  if (!base || base === '.' || base === '..') {
    throw new BadRequestException('Tên file không hợp lệ');
  }
  // Block double dangerous extensions: file.php.jpg, file.exe.png
  const lower = base.toLowerCase();
  for (const bad of BLOCKED_EXT) {
    if (lower.includes(bad + '.') || lower.endsWith(bad)) {
      // allow if the only ext is an allowed one ending... already handled by final ext
      if (lower.endsWith(bad) || lower.includes(bad + '.')) {
        const parts = lower.split('.');
        if (parts.length >= 3) {
          const mid = '.' + parts[parts.length - 2];
          if (BLOCKED_EXT.has(mid) || BLOCKED_EXT.has('.' + parts[parts.length - 2])) {
            throw new BadRequestException('Tên file chứa phần mở rộng nguy hiểm');
          }
        }
        if (lower.endsWith(bad) && !SERVE_ALLOWED_EXT.has(bad)) {
          throw new BadRequestException('Loại file không được phép');
        }
      }
    }
  }
  return base.slice(0, 500);
}

export function assertNoPathTraversal(relativePath: string): string {
  const raw = String(relativePath || '').replace(/\0/g, '');
  if (!raw || raw.includes('..')) {
    throw new BadRequestException('Đường dẫn không hợp lệ');
  }
  return raw.replace(/^\/+/, '');
}

export function randomStoredFilename(originalName: string): { filename: string; ext: string } {
  const safe = sanitizeOriginalName(originalName);
  const ext = extname(safe).toLowerCase();
  if (!ext || BLOCKED_EXT.has(ext) || !EXT_RULES[ext]) {
    throw new BadRequestException('Phần mở rộng không được phép');
  }
  return { filename: `${randomUUID()}${ext}`, ext };
}

export type ClassifiedUpload = {
  ext: string;
  originalName: string;
  mime: string;
  maxBytes: number;
  size: number;
};

export function assertUploadFile(
  profile: UploadProfile,
  file: { originalname?: string; mimetype?: string; size?: number } | undefined | null,
): ClassifiedUpload {
  if (!file) throw new BadRequestException('Thiếu file upload');
  const originalName = sanitizeOriginalName(file.originalname || 'file');
  const ext = extname(originalName).toLowerCase();
  const allowed = PROFILE_EXTS[profile];
  if (!allowed.includes(ext) || BLOCKED_EXT.has(ext)) {
    throw new BadRequestException(`Loại file không được phép cho profile=${profile}`);
  }
  const rule = EXT_RULES[ext];
  if (!rule) throw new BadRequestException('Loại file không được phép');
  const size = file.size ?? 0;
  if (size <= 0) throw new BadRequestException('File rỗng');
  const cap = Math.min(rule.maxBytes, PROFILE_MAX[profile]);
  if (size > cap) {
    throw new BadRequestException(`File vượt dung lượng tối đa ${(cap / (1024 * 1024)).toFixed(0)}MB`);
  }
  const mime = (file.mimetype || 'application/octet-stream').toLowerCase();
  if (mime !== 'application/octet-stream' && !rule.mimes.includes(mime)) {
    throw new BadRequestException(`MIME type không khớp phần mở rộng (${mime})`);
  }
  return { ext, originalName, mime, maxBytes: cap, size };
}

export function createUploadMulterOptions(profile: UploadProfile): Record<string, unknown> {
  const allowed = new Set(PROFILE_EXTS[profile]);
  const maxBytes = PROFILE_MAX[profile];
  return {
    storage: memoryStorage(),
    limits: { fileSize: maxBytes, files: 1 },
    fileFilter: (
      _req: unknown,
      file: { originalname?: string; mimetype?: string },
      cb: (error: Error | null, accept?: boolean) => void,
    ) => {
      try {
        const originalName = sanitizeOriginalName(file.originalname || 'file');
        const ext = extname(originalName).toLowerCase();
        if (!allowed.has(ext) || BLOCKED_EXT.has(ext) || !EXT_RULES[ext]) {
          cb(new BadRequestException(`Loại file không được phép (${ext || 'unknown'})`) as unknown as Error);
          return;
        }
        const mime = (file.mimetype || '').toLowerCase();
        const rule = EXT_RULES[ext];
        if (mime && mime !== 'application/octet-stream' && !rule.mimes.includes(mime)) {
          cb(new BadRequestException(`MIME không hợp lệ: ${mime}`) as unknown as Error);
          return;
        }
        cb(null, true);
      } catch (e) {
        cb(e as Error);
      }
    },
  };
}

export function contentTypeForExt(ext: string): string {
  switch (ext) {
    case '.pdf':
      return 'application/pdf';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.txt':
    case '.csv':
    case '.md':
      return 'text/plain; charset=utf-8';
    case '.mp4':
      return 'video/mp4';
    case '.webm':
      return 'video/webm';
    case '.mp3':
      return 'audio/mpeg';
    case '.wav':
      return 'audio/wav';
    default:
      return 'application/octet-stream';
  }
}
