/**
 * High-quality audio extract + two-pass STT for video transcription worker.
 */
import { spawn } from 'child_process';
import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import {
  VIDEO_TRANSCRIPTION_LIMITS,
  buildSttPrompt,
  detectSuspiciousSegments,
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
  playerClient?: string;
};

const YT_DLP_DOWNLOAD_STRATEGIES: YtDlpDownloadStrategy[] = [
  {
    label: 'dash-audio-hq',
    format: '140/251/ba[ext=m4a]/ba[ext=webm]/ba/bestaudio',
  },
  {
    label: 'progressive-audio',
    format: 'bestaudio[protocol^=http][vcodec=none]/best[height<=480]/best',
  },
  {
    label: 'progressive-fallback',
    format: '18/best[height<=480]/best',
  },
];

export function pass1Model(): string {
  return process.env.OPENAI_TRANSCRIBE_PASS1_MODEL?.trim() || 'whisper-1';
}

export function pass2Model(): string {
  return (
    process.env.OPENAI_TRANSCRIBE_PASS2_MODEL?.trim() ||
    process.env.OPENAI_TRANSCRIBE_MODEL?.trim() ||
    'gpt-4o-transcribe'
  );
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

/** Prefer highest-quality audio stream (no low-bitrate forced). Retries strategies on 403. */
export async function downloadYoutubeHq(
  url: string,
  workDir: string,
  durationHint = 3600,
  maxFileBytes: number,
): Promise<string> {
  const outTemplate = join(workDir, 'source.%(ext)s');
  const timeoutMs = cmdTimeoutForDuration(durationHint, 45 * 60 * 1000);
  let lastErr: Error | null = null;

  for (const strategy of YT_DLP_DOWNLOAD_STRATEGIES) {
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
      if (strategy.playerClient) {
        args.push('--extractor-args', `youtube:player_client=${strategy.playerClient}`);
      }
      args.push('--', url);

      await runCmd(ytDlpBin(), args, { timeoutMs, cwd: workDir });
      const { readdirSync } = await import('fs');
      const files = readdirSync(workDir).filter((f) => f.startsWith('source.'));
      if (!files.length) throw new Error('yt-dlp không tạo được file nguồn');
      console.log(
        `[video-transcription] yt-dlp ok strategy=${strategy.label}` +
          ` node=${ytDlpNodeBinary()}` +
          ` format=${strategy.format}`,
      );
      return join(workDir, files[0]!);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastErr = err instanceof Error ? err : new Error(msg);
      console.warn(
        `[video-transcription] yt-dlp strategy=${strategy.label} failed:`,
        msg.slice(0, 400),
      );
      // Clean partial downloads before next strategy
      try {
        const { readdirSync, unlinkSync } = await import('fs');
        for (const f of readdirSync(workDir)) {
          if (f.startsWith('source.') || f.endsWith('.part')) {
            unlinkSync(join(workDir, f));
          }
        }
      } catch {
        /* ignore cleanup errors */
      }
    }
  }

  throw lastErr ?? new Error('yt-dlp tải YouTube thất bại');
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
  // Prefer whisper-1 verbose for segment confidence; fallback gpt-4o-mini-transcribe
  try {
    return await callOpenAiTranscribe({
      audioPath: params.audioPath,
      model: model.includes('whisper') ? model : 'whisper-1',
      language: params.language,
      prompt: params.prompt,
      verbose: true,
      filename: 'chunk.wav',
      mimeType: 'audio/wav',
    });
  } catch (err) {
    console.warn(
      '[video-transcription] pass1 whisper failed:',
      err instanceof Error ? err.message : err,
    );
    return callOpenAiTranscribe({
      audioPath: params.audioPath,
      model: 'gpt-4o-mini-transcribe',
      language: params.language,
      prompt: params.prompt,
      verbose: false,
      filename: 'chunk.wav',
      mimeType: 'audio/wav',
    });
  }
}

export async function transcribeChunkPass2(params: {
  audioPath: string;
  language: string;
  prompt: string;
}): Promise<SttResult> {
  return callOpenAiTranscribe({
    audioPath: params.audioPath,
    model: pass2Model(),
    language: params.language,
    prompt: params.prompt,
    verbose: false,
    filename: 'retry.wav',
    mimeType: 'audio/wav',
  });
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
  const prompt = buildSttPrompt({
    glossary: params.glossary,
    previousTail: params.previousTail,
    videoTitle: params.videoTitle,
    chunkIndex: params.chunkIndex,
    chunkCount: params.chunkCount,
  });

  const pass1 = await transcribeChunkPass1({
    audioPath: params.chunkWavPath,
    language: params.language,
    prompt,
  });

  const retries: Array<{ start: number; end: number; reason: string; model: string }> = [];
  let text = pass1.text;
  let segments = pass1.segments.length
    ? pass1.segments
    : [{ start: 0, end: params.chunkEndSec - params.chunkStartSec, text: pass1.text }];

  const suspicious = detectSuspiciousSegments(segments, params.glossary);
  for (let i = 0; i < suspicious.length; i++) {
    const win = suspicious[i]!;
    // Absolute times on full audio
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
      const ctxPrompt = buildSttPrompt({
        glossary: params.glossary,
        previousTail: `${params.previousTail} ${text}`.slice(-400),
        videoTitle: params.videoTitle,
        chunkIndex: params.chunkIndex,
        chunkCount: params.chunkCount,
      });
      const pass2 = await transcribeChunkPass2({
        audioPath: retryPath,
        language: params.language,
        prompt: `${ctxPrompt} Đoạn nghi ngờ: "${win.text.slice(0, 120)}"`,
      });
      if (pass2.text.trim()) {
        if (text.includes(win.text)) {
          text = text.replace(win.text, pass2.text.trim());
        } else {
          // Replace by relative segment text if present
          text = `${text} ${pass2.text.trim()}`.replace(/\s+/g, ' ').trim();
        }
        retries.push({
          start: absStart,
          end: absStart + dur,
          reason: win.reason,
          model: pass2.model,
        });
        console.log(
          `[video-transcription] pass2 retry chunk=${params.chunkIndex}` +
            ` ${absStart.toFixed(1)}-${(absStart + dur).toFixed(1)}s` +
            ` reason=${win.reason} model=${pass2.model}`,
        );
      }
    } catch (err) {
      console.warn(
        `[video-transcription] pass2 failed chunk=${params.chunkIndex}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return {
    result: {
      text,
      language: pass1.language,
      segments,
      model: retries.length ? `${pass1.model}+${pass2Model()}` : pass1.model,
    },
    retries,
  };
}
