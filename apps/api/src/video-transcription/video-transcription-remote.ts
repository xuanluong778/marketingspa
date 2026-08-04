/**
 * yt-dlp probe helpers for video-transcription API (metadata only, no long download).
 */
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import {
  VIDEO_TRANSCRIPTION_LIMITS,
  mapVideoDownloadError,
  type VideoTranscriptionSourceType,
} from '@marketingspa/shared';

function ytDlpBin(): string {
  return process.env.YT_DLP_PATH?.trim() || 'yt-dlp';
}

function ytDlpNodeBinary(): string {
  const fromEnv = process.env.YT_DLP_NODE_PATH?.trim() || process.env.NODE_BINARY?.trim();
  if (fromEnv) return fromEnv;
  if (process.execPath && existsSync(process.execPath)) return process.execPath;
  return 'node';
}

function buildCommonArgs(): string[] {
  const args = [
    '--no-playlist',
    '--retries',
    '3',
    '--socket-timeout',
    '20',
    '--remote-components',
    process.env.YT_DLP_REMOTE_COMPONENTS?.trim() || 'ejs:github',
    '--js-runtimes',
    `node:${ytDlpNodeBinary()}`,
  ];
  const cookies = process.env.YT_DLP_COOKIES_FILE?.trim();
  if (cookies && existsSync(cookies)) {
    args.push('--cookies', cookies);
  }
  return args;
}

function runCmd(
  bin: string,
  args: string[],
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Timeout chạy ${bin}`));
    }, timeoutMs);
    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${bin} exit ${code}: ${(stderr || stdout).slice(0, 800)}`));
    });
  });
}

export type ApiRemoteVideoMeta = {
  title: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
};

export async function probeVideoUrlMeta(
  url: string,
  platform: Exclude<VideoTranscriptionSourceType, 'upload'>,
): Promise<ApiRemoteVideoMeta> {
  const timeoutMs = Math.min(90_000, VIDEO_TRANSCRIPTION_LIMITS.jobTimeoutMs);
  try {
    const { stdout } = await runCmd(
      ytDlpBin(),
      [
        ...buildCommonArgs(),
        '--skip-download',
        '--no-warnings',
        '--print',
        '%(.{title,thumbnail,duration})j',
        '--',
        url,
      ],
      timeoutMs,
    );
    const line = stdout
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.startsWith('{'));
    if (!line) {
      const mapped = mapVideoDownloadError(platform, 'empty metadata');
      throw Object.assign(new Error(mapped.message), { code: mapped.code });
    }
    const parsed = JSON.parse(line) as {
      title?: string;
      thumbnail?: string;
      duration?: number;
    };
    return {
      title: parsed.title?.trim() || null,
      thumbnailUrl: parsed.thumbnail?.trim() || null,
      durationSeconds:
        typeof parsed.duration === 'number' && Number.isFinite(parsed.duration)
          ? parsed.duration
          : null,
    };
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err) throw err;
    const raw = err instanceof Error ? err.message : String(err);
    const mapped = mapVideoDownloadError(platform, raw);
    throw Object.assign(new Error(mapped.message), { code: mapped.code });
  }
}
