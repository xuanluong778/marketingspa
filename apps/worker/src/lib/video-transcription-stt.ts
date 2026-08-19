/**
 * High-quality audio extract + two-pass STT for video transcription worker.
 */
import { spawn } from 'child_process';
import { existsSync, readdirSync, readFileSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';
import {
  VIDEO_TRANSCRIPTION_LIMITS,
  buildSttPrompt,
  detectSuspiciousSegments,
  isTranscriptTooShortForDuration,
  stripPromptEchoArtifacts,
  type TranscriptSegment,
} from '@marketingspa/shared';

function openaiBaseUrl(): string {
  return (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
}

export function ffmpegBin(): string {
  return process.env.FFMPEG_PATH?.trim() || 'ffmpeg';
}

export function ffprobeBin(): string {
  return process.env.FFPROBE_PATH?.trim() || 'ffprobe';
}

export function ytDlpBin(): string {
  return process.env.YT_DLP_PATH?.trim() || 'yt-dlp';
}

/** Node binary for yt-dlp EJS (required for YouTube dash audio — without it → HTTP 403). */
export function ytDlpNodeBinary(): string {
  const fromEnv = process.env.YT_DLP_NODE_PATH?.trim() || process.env.NODE_BINARY?.trim();
  if (fromEnv) return fromEnv;
  if (process.execPath && existsSync(process.execPath)) return process.execPath;
  const fallbacks = [
    '/var/www/marketingaut_usr75/data/.nvm/versions/node/v22.22.3/bin/node',
    '/var/www/marketingaut_usr75/data/.nvm/versions/node/v20.20.2/bin/node',
    '/usr/bin/node',
  ];
  for (const p of fallbacks) {
    if (existsSync(p)) return p;
  }
  return 'node';
}

function buildYtDlpCommonArgs(): string[] {
  const node = ytDlpNodeBinary();
  const args = [
    '--no-playlist',
    '--retries',
    '5',
    '--fragment-retries',
    '5',
    '--socket-timeout',
    '30',
    // Required since yt-dlp 2025+ for YouTube n/signature — dash audio 403 without this
    '--remote-components',
    process.env.YT_DLP_REMOTE_COMPONENTS?.trim() || 'ejs:github',
    '--js-runtimes',
    `node:${node}`,
  ];
  const cookies = process.env.YT_DLP_COOKIES_FILE?.trim();
  if (cookies && existsSync(cookies)) {
    args.push('--cookies', cookies);
  }
  return args;
}

type YtDlpDownloadStrategy = {
  label: string;
  format: string;
  merge?: string;
  playerClient?: string;
};

/** Prefer mergeable video+audio so users can download the video file. */
const YT_DLP_YOUTUBE_STRATEGIES: YtDlpDownloadStrategy[] = [
  {
    label: 'yt-mp4-720',
    format: 'bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/best[height<=720]',
    merge: 'mp4',
  },
  {
    label: 'yt-best-720',
    format: 'bv*[height<=720]+ba/b[height<=720]/best',
    merge: 'mp4',
  },
  {
    label: 'yt-progressive',
    format: '18/best[height<=480]/best',
  },
];

const YT_DLP_FACEBOOK_STRATEGIES: YtDlpDownloadStrategy[] = [
  // Prefer separate DASH audio+video then merge — progressive "hd/sd" can have weak/weird tracks
  {
    label: 'fb-ba-bv-merge',
    format: 'ba+bv/bestaudio+bestvideo/best',
    merge: 'mp4',
  },
  {
    label: 'fb-mp4-progressive',
    format: 'best[ext=mp4]/best[height<=720]/best',
  },
  {
    label: 'fb-best',
    format: 'best',
  },
];

const YT_DLP_TIKTOK_STRATEGIES: YtDlpDownloadStrategy[] = [
  {
    label: 'tt-mp4',
    format: 'download/best[ext=mp4]/best[height<=720]/best',
  },
  {
    label: 'tt-best',
    format: 'best',
  },
];

export type RemoteVideoPlatform = 'youtube' | 'facebook' | 'tiktok';

function strategiesForPlatform(platform: RemoteVideoPlatform): YtDlpDownloadStrategy[] {
  if (platform === 'facebook') return YT_DLP_FACEBOOK_STRATEGIES;
  if (platform === 'tiktok') return YT_DLP_TIKTOK_STRATEGIES;
  return YT_DLP_YOUTUBE_STRATEGIES;
}

export function pass1Model(): string {
  // Prefer high-quality transcript model first; whisper used as coverage fallback
  return (
    process.env.OPENAI_TRANSCRIBE_PASS1_MODEL?.trim() ||
    process.env.OPENAI_TRANSCRIBE_MODEL?.trim() ||
    'gpt-4o-transcribe'
  );
}

export function pass2Model(): string {
  return process.env.OPENAI_TRANSCRIBE_PASS2_MODEL?.trim() || 'whisper-1';
}

export function passFallbackModel(): string {
  return process.env.OPENAI_TRANSCRIBE_FALLBACK_MODEL?.trim() || 'gpt-4o-mini-transcribe';
}

export function cmdTimeoutForDuration(durationSec: number, baseMs: number): number {
  const scaled = Math.ceil(Math.max(durationSec, 60) * 2500);
  return Math.min(VIDEO_TRANSCRIPTION_LIMITS.jobTimeoutMs, Math.max(baseMs, scaled));
}

export function runCmd(
  bin: string,
  args: string[],
  opts?: { timeoutMs?: number; cwd?: string },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: opts?.cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Timeout chạy ${bin} (${opts?.timeoutMs ?? 0}ms)`));
    }, opts?.timeoutMs ?? VIDEO_TRANSCRIPTION_LIMITS.jobTimeoutMs);

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

export async function probeDurationSeconds(mediaPath: string): Promise<number> {
  const { stdout } = await runCmd(
    ffprobeBin(),
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      mediaPath,
    ],
    { timeoutMs: 120_000 },
  );
  const sec = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(sec) || sec <= 0) {
    throw new Error('Không đọc được thời lượng video/audio');
  }
  return sec;
}

export async function probeAudioMeta(mediaPath: string): Promise<{
  codec: string | null;
  bitRate: number | null;
  sampleRate: number | null;
  channels: number | null;
}> {
  try {
    const { stdout } = await runCmd(
      ffprobeBin(),
      [
        '-v',
        'error',
        '-select_streams',
        'a:0',
        '-show_entries',
        'stream=codec_name,bit_rate,sample_rate,channels',
        '-of',
        'json',
        mediaPath,
      ],
      { timeoutMs: 60_000 },
    );
    const parsed = JSON.parse(stdout) as {
      streams?: Array<{
        codec_name?: string;
        bit_rate?: string;
        sample_rate?: string;
        channels?: number;
      }>;
    };
    const s = parsed.streams?.[0];
    return {
      codec: s?.codec_name ?? null,
      bitRate: s?.bit_rate ? Number(s.bit_rate) : null,
      sampleRate: s?.sample_rate ? Number(s.sample_rate) : null,
      channels: s?.channels ?? null,
    };
  } catch {
    return { codec: null, bitRate: null, sampleRate: null, channels: null };
  }
}

/** True if media has at least one video stream (full video download leak detector). */
export async function probeHasVideoStream(mediaPath: string): Promise<boolean> {
  try {
    const { stdout } = await runCmd(
      ffprobeBin(),
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=codec_type,codec_name',
        '-of',
        'json',
        mediaPath,
      ],
      { timeoutMs: 60_000 },
    );
    const parsed = JSON.parse(stdout) as {
      streams?: Array<{ codec_type?: string; codec_name?: string }>;
    };
    return Array.isArray(parsed.streams) && parsed.streams.length > 0;
  } catch {
    return false;
  }
}

const VIDEO_SOURCE_EXTS = new Set([
  '.mp4',
  '.mkv',
  '.mov',
  '.avi',
  '.m4v',
  '.flv',
  '.ts',
  '.webm',
]);
const AUDIO_ONLY_EXTS = new Set([
  '.m4a',
  '.mp3',
  '.aac',
  '.ogg',
  '.opus',
  '.wav',
  '.flac',
  '.weba',
]);

export function isLikelyAudioOnlyExt(fileName: string): boolean {
  const ext = fileName.includes('.')
    ? `.${fileName.split('.').pop()!.toLowerCase()}`
    : '';
  if (AUDIO_ONLY_EXTS.has(ext)) return true;
  // .webm can be either — treat as not audio-only until probed
  if (ext === '.webm') return false;
  return !VIDEO_SOURCE_EXTS.has(ext);
}

/** Remove leftover source.* (and partials) so keepVideo=false never reuses old video. */
export function purgeSourceFiles(workDir: string): void {
  if (!existsSync(workDir)) return;
  try {
    for (const f of readdirSync(workDir)) {
      if (f.startsWith('source.') || f.endsWith('.part') || f.endsWith('.ytdl')) {
        try {
          unlinkSync(join(workDir, f));
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore */
  }
}

/**
 * Extract HQ mono WAV 16kHz with gentle loudness normalize (no aggressive denoise).
 */
export async function extractAudioHq(
  inputPath: string,
  outputWavPath: string,
  durationHint: number,
): Promise<void> {
  await runCmd(
    ffmpegBin(),
    [
      '-y',
      '-i',
      inputPath,
      '-vn',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-c:a',
      'pcm_s16le',
      // Gentle loudnorm — preserve consonants / leading phonemes
      '-af',
      'loudnorm=I=-16:TP=-1.5:LRA=11',
      outputWavPath,
    ],
    { timeoutMs: cmdTimeoutForDuration(durationHint, 30 * 60 * 1000) },
  );
  if (!existsSync(outputWavPath) || statSync(outputWavPath).size < 100) {
    throw new Error('Tách âm thanh HQ thất bại — file WAV rỗng');
  }
}

export async function sliceAudioWav(params: {
  audioPath: string;
  outPath: string;
  startSec: number;
  durationSec: number;
}): Promise<void> {
  await runCmd(
    ffmpegBin(),
    [
      '-y',
      '-ss',
      String(Math.max(0, params.startSec)),
      '-t',
      String(Math.max(0.2, params.durationSec)),
      '-i',
      params.audioPath,
      '-ac',
      '1',
      '-ar',
      '16000',
      '-c:a',
      'pcm_s16le',
      params.outPath,
    ],
    { timeoutMs: VIDEO_TRANSCRIPTION_LIMITS.chunkTimeoutMs },
  );
  if (!existsSync(params.outPath) || statSync(params.outPath).size < 50) {
    throw new Error(`Chunk WAV rỗng @${params.startSec}s`);
  }
}

export type RemoteVideoMeta = {
  title: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  webpageUrl: string | null;
};

/** Probe public metadata via yt-dlp (no download). */
export async function probeRemoteVideoMeta(
  url: string,
  platform: RemoteVideoPlatform,
  timeoutMs = 60_000,
): Promise<RemoteVideoMeta> {
  const { stdout } = await runCmd(
    ytDlpBin(),
    [
      ...buildYtDlpCommonArgs(),
      '--skip-download',
      '--no-warnings',
      '--print',
      '%(.{title,thumbnail,duration,webpage_url})j',
      '--',
      url,
    ],
    { timeoutMs },
  );
  const line = stdout
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith('{'));
  if (!line) {
    throw Object.assign(new Error(`Không đọc được metadata ${platform}`), {
      code: 'PROBE_FAILED',
    });
  }
  let parsed: {
    title?: string;
    thumbnail?: string;
    duration?: number;
    webpage_url?: string;
  };
  try {
    parsed = JSON.parse(line) as typeof parsed;
  } catch {
    throw Object.assign(new Error(`Metadata ${platform} không hợp lệ`), { code: 'PROBE_FAILED' });
  }
  const duration =
    typeof parsed.duration === 'number' && Number.isFinite(parsed.duration)
      ? parsed.duration
      : null;
  return {
    title: parsed.title?.trim() || null,
    thumbnailUrl: parsed.thumbnail?.trim() || null,
    durationSeconds: duration,
    webpageUrl: parsed.webpage_url?.trim() || null,
  };
}

/** Download public video (YouTube / Facebook / TikTok) into workDir/source.*. */
export async function downloadRemoteVideo(
  url: string,
  workDir: string,
  platform: RemoteVideoPlatform,
  durationHint = 3600,
  maxFileBytes: number,
): Promise<string> {
  const outTemplate = join(workDir, 'source.%(ext)s');
  const timeoutMs = cmdTimeoutForDuration(durationHint, 45 * 60 * 1000);
  let lastErr: Error | null = null;

  for (const strategy of strategiesForPlatform(platform)) {
    try {
      const args = [
        ...buildYtDlpCommonArgs(),
        '--max-filesize',
        String(maxFileBytes),
        '-f',
        strategy.format,
        '-o',
        outTemplate,
      ];
      if (strategy.merge) {
        args.push('--merge-output-format', strategy.merge);
      }
      if (strategy.playerClient) {
        args.push('--extractor-args', `youtube:player_client=${strategy.playerClient}`);
      }
      args.push('--', url);

      await runCmd(ytDlpBin(), args, { timeoutMs, cwd: workDir });
      const { readdirSync } = await import('fs');
      const files = readdirSync(workDir).filter((f) => f.startsWith('source.'));
      if (!files.length) throw new Error('yt-dlp không tạo được file nguồn');
      const downloadedFile = join(workDir, files[0]!);
      const fileSize = statSync(downloadedFile).size;
      console.log(
        `[video-transcription] yt-dlp video ok` +
          ` keepVideo=true` +
          ` selectedFormat=${strategy.format}` +
          ` downloadedFile=${files[0]}` +
          ` fileSize=${fileSize}` +
          ` platform=${platform}` +
          ` strategy=${strategy.label}`,
      );
      return downloadedFile;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastErr = err instanceof Error ? err : new Error(msg);
      console.warn(
        `[video-transcription] yt-dlp platform=${platform} strategy=${strategy.label} failed:`,
        msg.slice(0, 400),
      );
      purgeSourceFiles(workDir);
    }
  }

  throw lastErr ?? new Error(`yt-dlp tải ${platform} thất bại`);
}

/**
 * Download audio-only (no video stream / no merged video file) for STT.
 * Never falls back to full-video formats — only audio strategies.
 * Writes workDir/source.* (typically m4a/webm-audio/opus/mp3).
 */
export async function downloadRemoteAudio(
  url: string,
  workDir: string,
  platform: RemoteVideoPlatform,
  durationHint = 3600,
  maxFileBytes: number,
): Promise<string> {
  // Ensure no prior full-video residue is reused
  purgeSourceFiles(workDir);

  const outTemplate = join(workDir, 'source.%(ext)s');
  const timeoutMs = cmdTimeoutForDuration(durationHint, 45 * 60 * 1000);
  // Strict audio-only selectors — NEVER best / bv / mp4 progressive video
  const strategies: YtDlpDownloadStrategy[] = [
    { label: `${platform}-bestaudio`, format: 'bestaudio/ba' },
    { label: `${platform}-bestaudio-m4a`, format: 'bestaudio[ext=m4a]/ba[ext=m4a]/bestaudio' },
    { label: `${platform}-bestaudio-webm`, format: 'bestaudio[ext=webm]/ba[ext=webm]/bestaudio' },
    { label: `${platform}-worstaudio`, format: 'worstaudio/wa' },
  ];
  let lastErr: Error | null = null;

  for (const strategy of strategies) {
    try {
      const args = [
        ...buildYtDlpCommonArgs(),
        '--max-filesize',
        String(maxFileBytes),
        // Force audio extraction preference without inventing video formats
        '-f',
        strategy.format,
        // Never remux into video containers for STT path
        '-o',
        outTemplate,
        '--',
        url,
      ];
      console.log(
        `[video-transcription] yt-dlp audio-only try` +
          ` keepVideo=false` +
          ` selectedFormat=${strategy.format}` +
          ` platform=${platform}` +
          ` strategy=${strategy.label}`,
      );
      await runCmd(ytDlpBin(), args, { timeoutMs, cwd: workDir });
      const { readdirSync } = await import('fs');
      const files = readdirSync(workDir).filter((f) => f.startsWith('source.'));
      if (!files.length) throw new Error('yt-dlp không tạo được file audio');
      const downloadedFile = join(workDir, files[0]!);
      const fileSize = statSync(downloadedFile).size;
      if (fileSize < 256) throw new Error('File audio rỗng');

      // Reject pure video / containers with video streams
      const name = files[0]!.toLowerCase();
      if (name.endsWith('.mp4') || name.endsWith('.mkv') || name.endsWith('.mov') || name.endsWith('.avi')) {
        // Some platforms mislabel; only accept if zero video streams
        const hasV = await probeHasVideoStream(downloadedFile);
        if (hasV) {
          throw new Error(
            `Audio-only download produced video container with video stream: ${files[0]}`,
          );
        }
      } else if (name.endsWith('.webm') || name.endsWith('.m4a') || !isLikelyAudioOnlyExt(files[0]!)) {
        const hasV = await probeHasVideoStream(downloadedFile);
        if (hasV) {
          throw new Error(`Downloaded file has video stream (reject): ${files[0]}`);
        }
      }

      const hasVideo = await probeHasVideoStream(downloadedFile);
      if (hasVideo) {
        throw new Error(`Rejected download: video stream present in ${files[0]}`);
      }

      console.log(
        `[video-transcription] yt-dlp audio-only ok` +
          ` keepVideo=false` +
          ` selectedFormat=${strategy.format}` +
          ` downloadedFile=${files[0]}` +
          ` fileSize=${fileSize}` +
          ` platform=${platform}` +
          ` strategy=${strategy.label}`,
      );
      return downloadedFile;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastErr = err instanceof Error ? err : new Error(msg);
      console.warn(
        `[video-transcription] yt-dlp audio platform=${platform} strategy=${strategy.label} failed:`,
        msg.slice(0, 400),
      );
      purgeSourceFiles(workDir);
    }
  }

  throw lastErr ?? new Error(`yt-dlp tải audio ${platform} thất bại (không fallback video)`);
}

/** @deprecated use downloadRemoteVideo */
export async function downloadYoutubeHq(
  url: string,
  workDir: string,
  durationHint = 3600,
  maxFileBytes: number,
): Promise<string> {
  return downloadRemoteVideo(url, workDir, 'youtube', durationHint, maxFileBytes);
}

export type SttResult = {
  text: string;
  language?: string;
  segments: TranscriptSegment[];
  model: string;
};

async function callOpenAiTranscribe(params: {
  audioPath: string;
  model: string;
  language: string;
  prompt?: string;
  verbose: boolean;
  filename: string;
  mimeType: string;
}): Promise<SttResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error('OPENAI_API_KEY chưa được cấu hình trên worker');

  const buf = readFileSync(params.audioPath);
  if (buf.length > 24 * 1024 * 1024) {
    throw new Error('Chunk audio vượt 24MB — giảm độ dài chunk');
  }

  const form = new FormData();
  form.append('file', new Blob([buf], { type: params.mimeType }), params.filename);
  form.append('model', params.model);
  // Always force language when provided (default vi)
  const lang = params.language === 'auto' ? 'vi' : params.language;
  form.append('language', lang || 'vi');
  if (params.prompt?.trim()) {
    form.append('prompt', params.prompt.trim().slice(0, 800));
  }
  if (params.verbose) {
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'segment');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VIDEO_TRANSCRIPTION_LIMITS.chunkTimeoutMs);
  try {
    const res = await fetch(`${openaiBaseUrl()}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: controller.signal,
    });
    if (!res.ok) {
      let detail = '';
      try {
        const err = (await res.json()) as { error?: { message?: string } };
        detail = err.error?.message ?? '';
      } catch {
        detail = await res.text().catch(() => '');
      }
      throw new Error(`OpenAI transcribe ${res.status}${detail ? `: ${detail}` : ''}`);
    }
    const data = (await res.json()) as {
      text?: string;
      language?: string;
      segments?: Array<{
        start?: number;
        end?: number;
        text?: string;
        avg_logprob?: number;
        no_speech_prob?: number;
      }>;
    };
    const segments: TranscriptSegment[] = Array.isArray(data.segments)
      ? data.segments
          .map((s) => {
            const avgLogprob = typeof s.avg_logprob === 'number' ? s.avg_logprob : undefined;
            return {
              start: Number(s.start) || 0,
              end: Number(s.end) || 0,
              text: (s.text || '').trim(),
              avgLogprob,
              confidence: avgLogprob != null ? Math.exp(avgLogprob) : undefined,
            };
          })
          .filter((s) => s.text)
      : [];
    return {
      text: (data.text ?? '').trim(),
      language: data.language || lang,
      segments,
      model: params.model,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function transcribeChunkPass1(params: {
  audioPath: string;
  language: string;
  prompt: string;
}): Promise<SttResult> {
  const model = pass1Model();
  try {
    // gpt-4o-transcribe / mini: plain text; whisper: verbose segments when selected
    const useVerbose = model.includes('whisper');
    return await callOpenAiTranscribe({
      audioPath: params.audioPath,
      model,
      language: params.language,
      prompt: params.prompt,
      verbose: useVerbose,
      filename: 'chunk.wav',
      mimeType: 'audio/wav',
    });
  } catch (err) {
    console.warn(
      '[video-transcription] pass1 primary failed:',
      err instanceof Error ? err.message : err,
    );
    // Fallback chain: gpt-4o-mini → whisper-1 verbose
    try {
      return await callOpenAiTranscribe({
        audioPath: params.audioPath,
        model: passFallbackModel(),
        language: params.language,
        prompt: params.prompt,
        verbose: false,
        filename: 'chunk.wav',
        mimeType: 'audio/wav',
      });
    } catch (err2) {
      console.warn(
        '[video-transcription] pass1 mini failed:',
        err2 instanceof Error ? err2.message : err2,
      );
      return callOpenAiTranscribe({
        audioPath: params.audioPath,
        model: 'whisper-1',
        language: params.language,
        prompt: params.prompt,
        verbose: true,
        filename: 'chunk.wav',
        mimeType: 'audio/wav',
      });
    }
  }
}

export async function transcribeChunkPass2(params: {
  audioPath: string;
  language: string;
  prompt: string;
}): Promise<SttResult> {
  // Pass2 used for suspicious windows OR full-chunk recovery: prefer whisper verbose
  try {
    return await callOpenAiTranscribe({
      audioPath: params.audioPath,
      model: pass2Model().includes('whisper') ? pass2Model() : 'whisper-1',
      language: params.language,
      prompt: params.prompt,
      verbose: true,
      filename: 'retry.wav',
      mimeType: 'audio/wav',
    });
  } catch {
    return callOpenAiTranscribe({
      audioPath: params.audioPath,
      model: passFallbackModel(),
      language: params.language,
      prompt: params.prompt,
      verbose: false,
      filename: 'retry.wav',
      mimeType: 'audio/wav',
    });
  }
}

export async function twoPassTranscribeChunk(params: {
  chunkWavPath: string;
  fullAudioPath: string;
  chunksDir: string;
  chunkIndex: number;
  chunkStartSec: number;
  chunkEndSec: number;
  language: string;
  glossary: string[];
  previousTail: string;
  videoTitle?: string | null;
  chunkCount: number;
}): Promise<{
  result: SttResult;
  retries: Array<{ start: number; end: number; reason: string; model: string }>;
}> {
  const audioBytes = existsSync(params.chunkWavPath) ? statSync(params.chunkWavPath).size : 0;
  const durationHint = Math.max(0.1, params.chunkEndSec - params.chunkStartSec);

  console.log(
    `[video-transcription] STT start chunk=${params.chunkIndex}` +
      ` audioPath=${params.chunkWavPath}` +
      ` audioBytes=${audioBytes}` +
      ` duration=${durationHint.toFixed(2)}s` +
      ` pass1=${pass1Model()} pass2=${pass2Model()}`,
  );

  // Prefer empty-ish prompt; no title/đoạn labels (Whisper echoes them)
  const prompt = buildSttPrompt({
    glossary: params.glossary,
    previousTail: params.previousTail,
    // do not pass videoTitle / chunk labels into Whisper bias
  });

  const pass1 = await transcribeChunkPass1({
    audioPath: params.chunkWavPath,
    language: params.language,
    prompt,
  });

  let text = stripPromptEchoArtifacts(pass1.text);
  let segments = pass1.segments.length
    ? pass1.segments
    : text
      ? [{ start: 0, end: durationHint, text }]
      : [];
  let model = pass1.model;

  console.log(
    `[video-transcription] STT pass1 chunk=${params.chunkIndex}` +
      ` model=${pass1.model}` +
      ` rawLen=${(pass1.text || '').length}` +
      ` cleanedLen=${text.length}` +
      ` segments=${pass1.segments.length}` +
      ` preview=${JSON.stringify(text.slice(0, 80))}`,
  );

  const retries: Array<{ start: number; end: number; reason: string; model: string }> = [];

  // Full-chunk recovery when transcript is abnormally short for duration
  if (isTranscriptTooShortForDuration(text, durationHint) || !text) {
    console.warn(
      `[video-transcription] STT too-short chunk=${params.chunkIndex}` +
        ` len=${text.length} dur=${durationHint.toFixed(1)}s — retry whisper / mini`,
    );
    const recoverModels = ['whisper-1', passFallbackModel(), 'gpt-4o-transcribe'].filter(
      (m, i, a) => a.indexOf(m) === i && m !== pass1.model,
    );
    for (const m of recoverModels) {
      try {
        const recovered = await callOpenAiTranscribe({
          audioPath: params.chunkWavPath,
          model: m,
          language: params.language,
          prompt: '', // no prompt bias on recovery
          verbose: m.includes('whisper'),
          filename: 'chunk.wav',
          mimeType: 'audio/wav',
        });
        const recText = stripPromptEchoArtifacts(recovered.text);
        console.log(
          `[video-transcription] STT recover chunk=${params.chunkIndex}` +
            ` model=${m} rawLen=${(recovered.text || '').length} cleanedLen=${recText.length}` +
            ` segments=${(recovered.segments || []).length}` +
            ` preview=${JSON.stringify(recText.slice(0, 80))}`,
        );
        if (recText.length > text.length) {
          text = recText;
          segments = recovered.segments.length
            ? recovered.segments
            : [{ start: 0, end: durationHint, text: recText }];
          model = recovered.model;
          retries.push({
            start: params.chunkStartSec,
            end: params.chunkEndSec,
            reason: 'FULL_CHUNK_TOO_SHORT',
            model: m,
          });
        }
        if (!isTranscriptTooShortForDuration(text, durationHint) && text) break;
      } catch (err) {
        console.warn(
          `[video-transcription] recover model=${m} failed:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  // Windowed pass2 only when we already have reasonable body text
  if (!isTranscriptTooShortForDuration(text, durationHint) && segments.length) {
    const suspicious = detectSuspiciousSegments(segments, params.glossary);
    for (let i = 0; i < suspicious.length; i++) {
      const win = suspicious[i]!;
      const absStart = params.chunkStartSec + win.start;
      const absEnd = Math.min(params.chunkEndSec, params.chunkStartSec + win.end);
      const dur = Math.max(20, Math.min(40, absEnd - absStart));
      const retryPath = join(params.chunksDir, `retry-${params.chunkIndex}-${i}.wav`);
      try {
        await sliceAudioWav({
          audioPath: params.fullAudioPath,
          outPath: retryPath,
          startSec: absStart,
          durationSec: dur,
        });
        const pass2 = await transcribeChunkPass2({
          audioPath: retryPath,
          language: params.language,
          prompt: buildSttPrompt({
            glossary: params.glossary,
            previousTail: `${params.previousTail} ${text}`.slice(-200),
          }),
        });
        const p2 = stripPromptEchoArtifacts(pass2.text);
        if (p2.trim() && win.text && text.includes(win.text)) {
          text = text.replace(win.text, p2.trim());
          retries.push({
            start: absStart,
            end: absStart + dur,
            reason: win.reason,
            model: pass2.model,
          });
        }
      } catch (err) {
        console.warn(
          `[video-transcription] pass2 window failed chunk=${params.chunkIndex}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  text = stripPromptEchoArtifacts(text);

  console.log(
    `[video-transcription] STT final chunk=${params.chunkIndex}` +
      ` model=${model}` +
      ` textLen=${text.length}` +
      ` segments=${segments.length}` +
      ` retries=${retries.length}`,
  );

  return {
    result: {
      text,
      language: pass1.language,
      segments,
      model: retries.length ? `${model}+recover` : model,
    },
    retries,
  };
}
