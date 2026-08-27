import { BadRequestException } from '@nestjs/common';
import {
  assertUploadFile,
  sanitizeOriginalName,
  type ClassifiedUpload,
} from '../common/uploads/upload-policy';

export type WorkFileKind = 'image' | 'pdf' | 'doc' | 'sheet' | 'video' | 'zip';

export { sanitizeOriginalName };

export function classifyWorkUpload(
  originalName: string,
  mimeType?: string,
  size?: number,
): ClassifiedUpload & { kind: WorkFileKind } {
  const classified = assertUploadFile('work', {
    originalname: originalName,
    mimetype: mimeType,
    size,
  });
  const kindMap: Record<string, WorkFileKind> = {
    '.jpg': 'image',
    '.jpeg': 'image',
    '.png': 'image',
    '.gif': 'image',
    '.webp': 'image',
    '.pdf': 'pdf',
    '.doc': 'doc',
    '.docx': 'doc',
    '.xls': 'sheet',
    '.xlsx': 'sheet',
    '.mp4': 'video',
    '.webm': 'video',
    '.mov': 'video',
    '.zip': 'zip',
  };
  const kind = kindMap[classified.ext];
  if (!kind) throw new BadRequestException('Loại file không được phép');
  return { ...classified, kind };
}

export const WORK_UPLOAD_MAX_BYTES = 100 * 1024 * 1024;
