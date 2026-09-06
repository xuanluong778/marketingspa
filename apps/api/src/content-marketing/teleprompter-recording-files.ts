/**
 * Disk / S3-compatible layout for teleprompter recordings.
 * storageKey is relative (orgId/recordingId/object.ext) — never expose to clients.
 */
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { dirname, join } from 'path';
import type { Readable } from 'stream';

export const TELEPROMPTER_RECORDING_LIMITS = {
  /** Soft max per file (bytes) — env TELEPROMPTER_MAX_FILE_BYTES overrides */
  maxFileBytes: 500 * 1024 * 1024,
  /** Multipart chunk size recommended for clients */
  defaultPartSize: 5 * 1024 * 1024,
  minPartSize: 256 * 1024,
  maxPartSize: 16 * 1024 * 1024,
  maxParts: 2000,
  /** Incomplete upload TTL for cleanup */
  incompleteTtlMs: 24 * 60 * 60 * 1000,
  /** Signed download URL lifetime */
  downloadUrlTtlSec: 10 * 60,
  maxDurationSec: 30 * 60,
  maxTitleLen: 500,
} as const;

export const ALLOWED_RECORDING_MIMES = new Set([
  'video/webm',
  'video/mp4',
  'video/quicktime',
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
]);

export const RECORDING_TYPES = new Set(['video_audio', 'video_only', 'audio_only']);

export type RecordingStatus = 'uploading' | 'ready' | 'failed' | 'cancelled';

export function teleprompterRecordingsRoot(): string {
  const fromEnv = process.env.TELEPROMPTER_UPLOAD_DIR?.trim();
  if (fromEnv) return fromEnv;
  return join(process.cwd(), '..', '..', 'uploads', 'teleprompter-recordings');
}

export function maxRecordingFileBytes(): number {
  const raw = process.env.TELEPROMPTER_MAX_FILE_BYTES?.trim();
  if (raw && /^\d+$/.test(raw)) {
    return Math.min(Number(raw), 2 * 1024 * 1024 * 1024);
  }
  return TELEPROMPTER_RECORDING_LIMITS.maxFileBytes;
}

export function extForMime(mime: string): string {
  const base = mime.split(';')[0]?.trim().toLowerCase() || '';
  if (base.includes('webm')) return '.webm';
  if (base.includes('mp4') || base.includes('m4a')) return '.mp4';
  if (base.includes('quicktime')) return '.mov';
  if (base.includes('mpeg') || base === 'audio/mp3') return '.mp3';
  if (base.includes('ogg')) return '.ogg';
  if (base.includes('wav')) return '.wav';
  return '.bin';
}

export function buildStorageKey(organizationId: string, recordingId: string, mime: string): string {
  return join(organizationId, recordingId, `object${extForMime(mime)}`).replace(/\\/g, '/');
}

export function absoluteFromKey(storageKey: string): string {
  // Prevent path traversal
  const clean = storageKey.replace(/\\/g, '/').replace(/^\/+/, '');
  if (clean.includes('..') || clean.startsWith('/')) {
    throw new Error('Invalid storage key');
  }
  return join(teleprompterRecordingsRoot(), clean);
}

export function partsDirFromKey(storageKey: string): string {
  return join(dirname(absoluteFromKey(storageKey)), 'parts');
}

export function ensureRecordingDirs(storageKey: string): void {
  const objectAbs = absoluteFromKey(storageKey);
  mkdirSync(dirname(objectAbs), { recursive: true });
  mkdirSync(partsDirFromKey(storageKey), { recursive: true });
}

export function removeRecordingObject(storageKey: string | null | undefined): void {
  if (!storageKey) return;
  try {
    const abs = absoluteFromKey(storageKey);
    const dir = dirname(abs);
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  } catch {
    // best-effort
  }
}

/** Magic-byte sniff — rejects MIME spoofing (extension/header lie). */
export function sniffContainerMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  // EBML / WebM / MKV
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return 'video/webm'; // container; may be audio/webm — refine by caller mode
  }
  // Ogg
  if (buf.slice(0, 4).toString('ascii') === 'OggS') return 'audio/ogg';
  // WAV
  if (
    buf.slice(0, 4).toString('ascii') === 'RIFF' &&
    buf.slice(8, 12).toString('ascii') === 'WAVE'
  ) {
    return 'audio/wav';
  }
  // MP3 frame sync or ID3
  if (buf.slice(0, 3).toString('ascii') === 'ID3') return 'audio/mpeg';
  if (buf[0] === 0xff && buf.length > 1 && (buf[1]! & 0xe0) === 0xe0) return 'audio/mpeg';
  // ISO BMFF (mp4/m4a/mov)
  const ftyp = buf.slice(4, 8).toString('ascii');
  if (ftyp === 'ftyp') {
    const brand = buf.slice(8, 12).toString('ascii').toLowerCase();
    if (brand.startsWith('qt')) return 'video/quicktime';
    if (brand.includes('M4A') || brand === 'm4a ' || brand === 'mp41' || brand === 'isom') {
      // m4a vs mp4 — treat as video/mp4 family; audio callers may claim audio/mp4
      return 'video/mp4';
    }
    return 'video/mp4';
  }
  return null;
}

export function mimeCompatible(
  declared: string,
  sniffed: string | null,
  recordingType: string,
): boolean {
  const d = declared.split(';')[0]?.trim().toLowerCase() || '';
  if (!ALLOWED_RECORDING_MIMES.has(d)) return false;
  if (!sniffed) return false;

  // WebM container
  if (sniffed === 'video/webm') {
    return d.includes('webm');
  }
  // MP4 family
  if (sniffed === 'video/mp4' || sniffed === 'video/quicktime') {
    return d.includes('mp4') || d.includes('quicktime') || d.includes('m4a') || d === 'audio/mp4';
  }
  // Pure audio containers
  if (sniffed.startsWith('audio/')) {
    if (recordingType === 'video_only') return false;
    return d.startsWith('audio/') || d.includes(sniffed.split('/')[1] || '');
  }
  return false;
}

export function validateInitParams(input: {
  title: string;
  recordingType: string;
  mimeType: string;
  size: number;
  duration?: number;
  partSize?: number;
}): { ok: true } | { ok: false; message: string } {
  const title = (input.title || '').trim();
  if (!title) return { ok: false, message: 'Thiếu tiêu đề recording' };
  if (title.length > TELEPROMPTER_RECORDING_LIMITS.maxTitleLen) {
    return { ok: false, message: 'Tiêu đề quá dài' };
  }
  if (!RECORDING_TYPES.has(input.recordingType)) {
    return { ok: false, message: 'recordingType không hợp lệ' };
  }
  const mime = (input.mimeType || '').split(';')[0]?.trim().toLowerCase() || '';
  if (!ALLOWED_RECORDING_MIMES.has(mime)) {
    return { ok: false, message: 'MIME không được hỗ trợ' };
  }
  if (!Number.isFinite(input.size) || input.size <= 0) {
    return { ok: false, message: 'size không hợp lệ' };
  }
  if (input.size > maxRecordingFileBytes()) {
    return {
      ok: false,
      message: `File vượt giới hạn ${Math.round(maxRecordingFileBytes() / (1024 * 1024))}MB`,
    };
  }
  const duration = input.duration ?? 0;
  if (duration < 0 || duration > TELEPROMPTER_RECORDING_LIMITS.maxDurationSec + 60) {
    return { ok: false, message: 'duration vượt giới hạn phiên (30 phút)' };
  }
  if (input.partSize != null) {
    if (
      input.partSize < TELEPROMPTER_RECORDING_LIMITS.minPartSize ||
      input.partSize > TELEPROMPTER_RECORDING_LIMITS.maxPartSize
    ) {
      return { ok: false, message: 'partSize ngoài khoảng cho phép' };
    }
  }
  const parts = Math.ceil(
    input.size / (input.partSize || TELEPROMPTER_RECORDING_LIMITS.defaultPartSize),
  );
  if (parts > TELEPROMPTER_RECORDING_LIMITS.maxParts) {
    return { ok: false, message: 'Số part quá lớn' };
  }
  return { ok: true };
}

export function partEtag(partNumber: number, data: Buffer): string {
  return createHash('md5').update(String(partNumber)).update(data).digest('hex');
}

export async function writePart(
  storageKey: string,
  partNumber: number,
  body: Buffer | Readable,
): Promise<{ etag: string; bytes: number }> {
  if (
    !Number.isInteger(partNumber) ||
    partNumber < 1 ||
    partNumber > TELEPROMPTER_RECORDING_LIMITS.maxParts
  ) {
    throw new Error('partNumber invalid');
  }
  ensureRecordingDirs(storageKey);
  const partPath = join(partsDirFromKey(storageKey), String(partNumber));
  const tmp = `${partPath}.${randomUUID()}.tmp`;

  let buf: Buffer;
  if (Buffer.isBuffer(body)) {
    buf = body;
    writeFileSync(tmp, buf);
  } else {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    buf = Buffer.concat(chunks);
    writeFileSync(tmp, buf);
  }
  if (buf.length > TELEPROMPTER_RECORDING_LIMITS.maxPartSize) {
    rmSync(tmp, { force: true });
    throw new Error('Part quá lớn');
  }
  if (buf.length === 0) {
    rmSync(tmp, { force: true });
    throw new Error('Part rỗng');
  }
  renameSync(tmp, partPath);
  return { etag: partEtag(partNumber, buf), bytes: buf.length };
}

export function listWrittenParts(storageKey: string): number[] {
  const dir = partsDirFromKey(storageKey);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => /^\d+$/.test(n))
    .map((n) => Number(n))
    .sort((a, b) => a - b);
}

export async function assemblePartsAsync(
  storageKey: string,
  expectedParts: number[],
): Promise<number> {
  // Reliability over streaming elegance for typical teleprompter sizes (≤500MB RAM host)
  return assembleParts(storageKey, expectedParts);
}

export function assembleParts(storageKey: string, expectedParts: number[]): number {
  // sync wrapper used in tests / small files
  const dest = absoluteFromKey(storageKey);
  ensureRecordingDirs(storageKey);
  const partsDir = partsDirFromKey(storageKey);
  const chunks: Buffer[] = [];
  let total = 0;
  for (const n of expectedParts) {
    const p = join(partsDir, String(n));
    if (!existsSync(p)) throw new Error(`Thiếu part ${n}`);
    const data = readFileSync(p);
    chunks.push(data);
    total += data.length;
  }
  writeFileSync(dest, Buffer.concat(chunks));
  rmSync(partsDir, { recursive: true, force: true });
  return total;
}

export function objectSize(storageKey: string): number {
  const abs = absoluteFromKey(storageKey);
  if (!existsSync(abs)) return 0;
  return statSync(abs).size;
}

export function openObjectStream(storageKey: string): NodeJS.ReadableStream {
  return createReadStream(absoluteFromKey(storageKey));
}

export function objectExists(storageKey: string): boolean {
  try {
    return existsSync(absoluteFromKey(storageKey));
  } catch {
    return false;
  }
}

export function downloadSigningSecret(): string {
  return (
    process.env.TELEPROMPTER_DOWNLOAD_SECRET?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    'dev-teleprompter-download-secret'
  );
}

/** HMAC-signed download token — embeds id + exp, no storage path */
export function signDownloadToken(
  payload: { recordingId: string; organizationId: string; userId: string; exp: number },
  secret = downloadSigningSecret(),
): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyDownloadToken(
  token: string,
  secret = downloadSigningSecret(),
): { recordingId: string; organizationId: string; userId: string; exp: number } | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      recordingId: string;
      organizationId: string;
      userId: string;
      exp: number;
    };
    if (!data.recordingId || !data.organizationId || !data.userId || !data.exp) return null;
    if (Date.now() / 1000 > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

export function sanitizeTitle(title: string): string {
  return title.trim().slice(0, TELEPROMPTER_RECORDING_LIMITS.maxTitleLen) || 'Recording';
}

export function filenameFromTitle(title: string, mime: string): string {
  const base =
    title
      .replace(/[^\w\u00C0-\u024F\s.-]+/g, '_')
      .trim()
      .slice(0, 80) || 'recording';
  return `${base}${extForMime(mime)}`;
}
