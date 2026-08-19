/**
 * Video transcription pipeline tests — chunking, overlap merge, VN normalize, ad loops.
 * Run: pnpm test:video-transcription
 */
import assert from 'node:assert/strict';
import {
  VIDEO_TRANSCRIPTION_LIMITS,
  buildChunkPlan,
  classifyVideoSourceUrl,
  cleanTranscriptText,
  collapseRepeatedBlocks,
  durationsMatch,
  findOverlapWordCount,
  isAllowedVideoTranscriptionHost,
  isChunkAsrCoverageAcceptable,
  mapVideoDownloadError,
  mergeChunkTranscripts,
  normalizeVietnameseTranscript,
  resolveDailyTranscriptionQuota,
  sumCompletedChunkCoverage,
  type TranscriptChunkResult,
} from '../packages/shared/src/video-transcription';

function testClassify() {
  assert.equal(classifyVideoSourceUrl('https://www.youtube.com/watch?v=abc').ok, true);
  assert.equal(classifyVideoSourceUrl('https://youtu.be/abc').sourceType, 'youtube');
  assert.equal(
    classifyVideoSourceUrl('https://www.youtube.com/shorts/xyz123').sourceType,
    'youtube',
  );
  const fb = classifyVideoSourceUrl('https://www.facebook.com/watch/?v=1');
  assert.equal(fb.ok, true);
  assert.equal(fb.sourceType, 'facebook');
  const reel = classifyVideoSourceUrl('https://www.facebook.com/reel/123');
  assert.equal(reel.sourceType, 'facebook');
  const tt = classifyVideoSourceUrl('https://www.tiktok.com/@user/video/123');
  assert.equal(tt.ok, true);
  assert.equal(tt.sourceType, 'tiktok');
  const bad = classifyVideoSourceUrl('https://example.com/video/1');
  assert.equal(bad.ok, false);
  assert.equal(bad.errorCode, 'UNSUPPORTED_URL');
  const local = classifyVideoSourceUrl('http://localhost/x');
  assert.equal(local.ok, false);
  assert.equal(local.errorCode, 'LOCALHOST');
  const priv = classifyVideoSourceUrl('http://127.0.0.1/x');
  assert.equal(priv.ok, false);
  assert.equal(priv.errorCode, 'PRIVATE_IP');
  console.log('PASS classifyVideoSourceUrl (yt/fb/tt/shorts/ssrf hosts)');
}

function testPlatformErrors() {
  const ytPrivate = mapVideoDownloadError('youtube', 'ERROR: Private video');
  assert.equal(ytPrivate.code, 'PRIVATE_OR_RESTRICTED');
  assert.ok(/YouTube/i.test(ytPrivate.message));
  const ytBot = mapVideoDownloadError(
    'youtube',
    "Sign in to confirm you're not a bot. Use --cookies",
  );
  assert.equal(ytBot.code, 'PLATFORM_BOTCHECK');
  const fbDrm = mapVideoDownloadError('facebook', 'DRM protected widevine');
  assert.equal(fbDrm.code, 'DRM_OR_PROTECTED');
  assert.ok(/Facebook/i.test(fbDrm.message));
  const ttGone = mapVideoDownloadError('tiktok', 'Unsupported URL');
  assert.equal(ttGone.code, 'UNSUPPORTED_OR_GONE');
  assert.ok(/TikTok/i.test(ttGone.message));
  const ttIp = mapVideoDownloadError('tiktok', 'Your IP address is blocked from accessing this post');
  assert.equal(ttIp.code, 'PLATFORM_IP_BLOCKED');
  console.log('PASS mapVideoDownloadError per platform');
}

function testHosts() {
  assert.equal(isAllowedVideoTranscriptionHost('www.youtube.com'), true);
  assert.equal(isAllowedVideoTranscriptionHost('vm.tiktok.com'), true);
  assert.equal(isAllowedVideoTranscriptionHost('m.facebook.com'), true);
  assert.equal(isAllowedVideoTranscriptionHost('evil.internal'), false);
  console.log('PASS isAllowedVideoTranscriptionHost');
}

function assertPlanCoversFull(
  duration: number,
  plans: ReturnType<typeof buildChunkPlan>,
  label: string,
) {
  assert.ok(plans.length >= 1, `${label}: empty plan`);
  assert.equal(plans[0]!.startSec, 0, `${label}: must start at 0`);
  assert.ok(
    plans[plans.length - 1]!.endSec >= duration - 0.1,
    `${label}: last end ${plans[plans.length - 1]!.endSec} < ${duration}`,
  );
  for (let i = 1; i < plans.length; i++) {
    assert.ok(plans[i]!.startSec < plans[i - 1]!.endSec, `${label}: gap before chunk ${i}`);
    const ov = plans[i - 1]!.endSec - plans[i]!.startSec;
    assert.ok(ov >= 5 && ov <= 10, `${label}: overlap ${ov} not in 5–10s`);
  }
}

function testChunkPlan() {
  const short = buildChunkPlan(120);
  assert.equal(short.length, 1);
  assert.equal(short[0]!.endSec, 120);
  assertPlanCoversFull(120, short, 'short');

  // ~30 phút (default 5m chunks → ≥5)
  const m30 = buildChunkPlan(30 * 60);
  assert.ok(m30.length >= 5, `30m expected ≥5 chunks, got ${m30.length}`);
  assertPlanCoversFull(30 * 60, m30, '30m');

  // ≥5 chunks (40 phút)
  const m40 = buildChunkPlan(40 * 60);
  assert.ok(m40.length >= 5, `40m expected ≥5 chunks, got ${m40.length}`);
  assertPlanCoversFull(40 * 60, m40, '40m');

  const odd = buildChunkPlan(5 * 60 + 8 + 40);
  assertPlanCoversFull(5 * 60 + 8 + 40, odd, 'odd');

  const over30 = buildChunkPlan(35 * 60);
  assert.ok(over30.length >= 5);
  assertPlanCoversFull(35 * 60, over30, '35m');

  console.log(
    `PASS buildChunkPlan short=1 30m=${m30.length} 40m=${m40.length} (>=5, full coverage)`,
  );
}

function testOverlapMerge() {
  const prev = 'Xin chao cac ban hom nay chung ta se noi ve marketing va ban hang online';
  const next = 've marketing va ban hang online tiep theo la cach viet content thu hut';
  const k = findOverlapWordCount(prev, next);
  assert.ok(k >= 4, `expected overlap words, got ${k}`);
  const longNext = `${next} ${'them noi dung quan trong '.repeat(40)}`;
  const k2 = findOverlapWordCount(prev, longNext, 80);
  assert.ok(k2 <= Math.floor(longNext.trim().split(/\s+/).length * 0.5) + 1);

  const merged = mergeChunkTranscripts([
    {
      index: 0,
      startSec: 0,
      endSec: 420,
      text: prev,
      segments: [{ start: 0, end: 400, text: prev }],
    },
    {
      index: 1,
      startSec: 412,
      endSec: 800,
      text: next,
      segments: [{ start: 0, end: 380, text: next }],
    },
  ]);
  assert.ok(merged.rawMerged.includes('Xin chao'));
  assert.ok(merged.rawMerged.includes('viet content'));
  const dup = /marketing va ban hang online\s+marketing va ban hang online/i;
  assert.equal(dup.test(merged.rawMerged), false);
  assert.ok(merged.lastTimestamp != null && merged.lastTimestamp >= 800);
  console.log('PASS mergeChunkTranscripts / overlap');
}

/** Regression: segment-filter merge must not drop / overwrite with only last chunk */
function testMergeKeepsAllChunks() {
  const plans = buildChunkPlan(30 * 60);
  assert.ok(plans.length >= 5);
  const chunks = plans.map((p, i) => ({
    index: i,
    startSec: p.startSec,
    endSec: p.endSec,
    text: `HEAD_${i} unique middle content for chunk ${i} TAIL_${i}`,
    segments: [
      {
        start: 0,
        end: Math.min(30, p.durationSec * 0.2),
        text: `HEAD_${i} unique middle content for chunk ${i} TAIL_${i}`,
      },
    ],
  }));
  const m = mergeChunkTranscripts(chunks);
  for (let i = 0; i < plans.length; i++) {
    assert.ok(m.rawMerged.includes(`HEAD_${i}`), `missing HEAD_${i}`);
    assert.ok(m.rawMerged.includes(`TAIL_${i}`), `missing TAIL_${i}`);
  }
  assert.equal(m.firstTimestamp, 0);
  assert.ok((m.lastTimestamp ?? 0) >= 30 * 60 - 1);
  console.log(`PASS merge keeps all ${plans.length} chunks head/mid/tail`);
}

function testAsrCoverageGate() {
  const words = Array.from({ length: 80 }, (_, i) => `tu${i}`).join(' ');
  const bad = isChunkAsrCoverageAcceptable({
    durationSec: 300,
    text: words,
    segments: [{ start: 0, end: 60, text: words }],
  });
  assert.equal(bad.ok, false, 'truncated ASR must fail');

  const good = isChunkAsrCoverageAcceptable({
    durationSec: 300,
    text: words + ' ' + words + ' ' + words,
    segments: [{ start: 0, end: 280, text: words }],
  });
  assert.equal(good.ok, true);

  const empty = isChunkAsrCoverageAcceptable({
    durationSec: 300,
    text: '',
    segments: [],
  });
  assert.equal(empty.ok, false);

  const short = isChunkAsrCoverageAcceptable({
    durationSec: 20,
    text: 'ok enough text for short clip hello world',
    segments: [],
  });
  assert.equal(short.ok, true);

  // FB reel bug: prompt echo "Đoạn 2. Đoạn 3." must NEVER complete for 47s
  const promptEcho = isChunkAsrCoverageAcceptable({
    durationSec: 47,
    text: 'Đoạn 2. Đoạn 3.',
    segments: [{ start: 0, end: 46, text: 'Đoạn 2. Đoạn 3.' }],
  });
  assert.equal(promptEcho.ok, false, 'prompt-echo must fail quality gate');

  console.log('PASS isChunkAsrCoverageAcceptable');
}

function testIncompleteChunksBlockComplete() {
  const plans = buildChunkPlan(30 * 60);
  const chunks: TranscriptChunkResult[] = plans.map((p, i) => ({
    index: i,
    startSec: p.startSec,
    endSec: p.endSec,
    status: i === plans.length - 1 ? 'failed' : 'completed',
    text: `c${i}`,
    rawText: `c${i}`,
    segments: [],
    charCount: 2,
    attempts: 1,
  }));
  const pending = chunks.filter((c) => c.status !== 'completed');
  assert.ok(pending.length === 1);
  const covered = sumCompletedChunkCoverage(chunks);
  assert.equal(durationsMatch(30 * 60, covered), false);
  console.log('PASS incomplete last chunk blocks durationMatch/COMPLETED');
}

function testAdLoop() {
  const ad =
    'Mua ngay khoa hoc marketing chi voi 199 nghin dong duy nhat hom nay ngay hom nay';
  const loop = `${ad} ${ad} ${ad} phan noi dung that bat dau tu day ve chien luoc content`;
  const cleaned = collapseRepeatedBlocks(loop);
  const count = (cleaned.match(/199 nghin/g) || []).length;
  assert.ok(count <= 1, `ad repeats collapsed, got ${count}`);
  assert.ok(cleaned.includes('chien luoc content'));
  console.log('PASS collapseRepeatedBlocks (ad loop)');
}

function testVietnameseNormalize() {
  const raw =
    'xin chao cac ban hom nay chung ta hoc marketing.day la bai so 1 tiep theo chung ta se noi ve facebook ads';
  const out = normalizeVietnameseTranscript(raw);
  assert.ok(/^[A-Z]/.test(out), `should capitalize start: ${out.slice(0, 20)}`);
  assert.ok(out.includes('. '), 'space after period');
  assert.ok(!out.includes('.day'));
  assert.ok(out.toLowerCase().includes('marketing'));
  assert.ok(out.toLowerCase().includes('facebook'));
  console.log('PASS normalizeVietnameseTranscript');
}

function testMissingEndGuard() {
  const chunks: TranscriptChunkResult[] = [
    {
      index: 0,
      startSec: 0,
      endSec: 420,
      status: 'completed',
      text: 'a',
      rawText: 'a',
      segments: [],
      charCount: 1,
      attempts: 1,
    },
    {
      index: 1,
      startSec: 412,
      endSec: 800,
      status: 'completed',
      text: 'b',
      rawText: 'b',
      segments: [],
      charCount: 1,
      attempts: 1,
    },
  ];
  const covered = sumCompletedChunkCoverage(chunks);
  assert.ok(Math.abs(covered - 800) < 0.1);
  assert.equal(durationsMatch(800, covered), true);
  assert.equal(durationsMatch(800, 600), false);
  console.log('PASS duration coverage gate');
}

function testCleanKeepsContent() {
  const midCut = 'Day la cau hoan chinh. Day la cau bi cat giua chu';
  const cleaned = cleanTranscriptText(midCut);
  assert.ok(cleaned.includes('cau bi cat'));
  console.log('PASS clean does not drop ending fragment');
}

function testQuotaLimits() {
  assert.equal(
    resolveDailyTranscriptionQuota(null, true),
    VIDEO_TRANSCRIPTION_LIMITS.dailyQuotaByPlan.trial,
  );
  assert.equal(VIDEO_TRANSCRIPTION_LIMITS.maxDurationSeconds, 30 * 60);
  assert.equal(VIDEO_TRANSCRIPTION_LIMITS.maxFileBytes, 500 * 1024 * 1024);
  assert.ok(VIDEO_TRANSCRIPTION_LIMITS.chunkSeconds >= 5 * 60);
  assert.ok(VIDEO_TRANSCRIPTION_LIMITS.chunkSeconds <= 10 * 60);
  assert.ok(VIDEO_TRANSCRIPTION_LIMITS.overlapSeconds >= 5);
  assert.ok(VIDEO_TRANSCRIPTION_LIMITS.chunkMaxAttempts >= 2);
  console.log('PASS limits / quota / chunk band 5–10m');
}

function testFastSpeechWords() {
  const raw = 'hom nay chung ta co10 cach lam content';
  const out = normalizeVietnameseTranscript(raw);
  assert.ok(out.includes('10'));
  assert.ok(/co\s+10/.test(out));
  console.log('PASS stuck digit/letter spacing');
}

testClassify();
testPlatformErrors();
testHosts();
testChunkPlan();
testOverlapMerge();
testMergeKeepsAllChunks();
testAsrCoverageGate();
testIncompleteChunksBlockComplete();
testAdLoop();
testVietnameseNormalize();
testMissingEndGuard();
testCleanKeepsContent();
testQuotaLimits();
testFastSpeechWords();
console.log('test-video-transcription: ALL PASS');
