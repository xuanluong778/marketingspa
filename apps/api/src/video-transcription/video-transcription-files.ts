import { join } from 'path';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { Logger } from '@nestjs/common';

const log = new Logger('VideoTranscriptionFiles');

/** Absolute uploads root for video transcription workdirs */
export function videoTranscriptionUploadsRoot(): string {
  const fromEnv = process.env.VIDEO_TRANSCRIPTION_UPLOAD_DIR?.trim();
  if (fromEnv) return fromEnv;
  // apps/api cwd → monorepo uploads/
  return join(process.cwd(), '..', '..', 'uploads', 'video-transcriptions');
}

export function ensureOrgWorkDir(organizationId: string, transcriptionId: string): {
  absolute: string;
  relative: string;
} {
  const relative = join(organizationId, transcriptionId);
  const absolute = join(videoTranscriptionUploadsRoot(), relative);
  mkdirSync(absolute, { recursive: true });
  return { absolute, relative };
}

export function removeWorkDir(absolutePath: string | null | undefined): void {
  if (!absolutePath) return;
  try {
    if (existsSync(absolutePath)) {
      rmSync(absolutePath, { recursive: true, force: true });
      log.log(`Removed temp dir ${absolutePath}`);
    }
  } catch (err) {
    log.warn(
      `Failed to remove temp dir ${absolutePath}: ${err instanceof Error ? err.message : err}`,
    );
  }
}

export const ALLOWED_MEDIA_MIME = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/webm',
  'audio/ogg',
  'application/octet-stream',
]);

export const ALLOWED_MEDIA_EXT = new Set([
  '.mp4',
  '.webm',
  '.mov',
  '.avi',
  '.mkv',
  '.mp3',
  '.wav',
  '.m4a',
  '.ogg',
  '.aac',
]);
