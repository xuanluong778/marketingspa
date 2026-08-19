/**
 * Tests: MIME selection, state transitions, MediaStream cleanup helpers,
 * recorder ↔ teleprompter sync contract (pure).
 *
 * Run: pnpm --filter @marketingspa/database exec tsx ../../scripts/test-teleprompter-recorder.ts
 */
import assert from 'node:assert/strict';
import {
  buildRecordingFilename,
  canTransition,
  classifyMediaError,
  constraintsForMode,
  estimateRecordingBytes,
  extensionForMime,
  formatByteSize,
  formatRecordingClock,
  MAX_RECOMMENDED_SECONDS,
  permissionRecoverySteps,
  pickRecorderMimeType,
  qualityToResolution,
  sanitizeRecordingFilename,
  shouldBlockUnload,
  sizeWarningLevel,
  stopMediaStream,
  WARN_SIZE_BYTES,
  type TeleprompterRecorderState,
} from '../apps/web/src/lib/teleprompter-media';

function section(name: string) {
  console.log(`\n=== ${name} ===`);
}

section('MIME selection priority — video modes');
{
  const supported = new Set([
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ]);
  const isTypeSupported = (m: string) => supported.has(m);
  assert.equal(
    pickRecorderMimeType('video_audio', isTypeSupported),
    'video/webm;codecs=vp8,opus',
    'vp9 missing → pick vp8',
  );
  assert.equal(
    pickRecorderMimeType('video_only', isTypeSupported),
    'video/webm;codecs=vp8,opus',
  );

  const onlyMp4 = (m: string) => m === 'video/mp4';
  assert.equal(pickRecorderMimeType('video_audio', onlyMp4), 'video/mp4');

  const none = () => false;
  assert.equal(pickRecorderMimeType('video_audio', none), null);
  console.log('PASS video mime order');
}

section('MIME selection — audio only');
{
  const supported = new Set(['audio/webm', 'audio/mp4']);
  const isTypeSupported = (m: string) => supported.has(m);
  assert.equal(pickRecorderMimeType('audio_only', isTypeSupported), 'audio/webm');
  // Must not pick video/* for audio_only
  const videoOnly = (m: string) => m.startsWith('video/');
  assert.equal(pickRecorderMimeType('audio_only', videoOnly), null);
  console.log('PASS audio mime');
}

section('Extension matches MIME (no hardcode mp4 on webm)');
{
  assert.equal(extensionForMime('video/webm;codecs=vp9,opus'), 'webm');
  assert.equal(extensionForMime('video/webm;codecs=vp8,opus'), 'webm');
  assert.equal(extensionForMime('video/webm'), 'webm');
  assert.equal(extensionForMime('video/mp4'), 'mp4');
  assert.equal(extensionForMime('audio/webm;codecs=opus'), 'webm');
  assert.equal(extensionForMime('audio/webm'), 'webm');
  assert.equal(extensionForMime('audio/mp4'), 'mp4');

  const name = buildRecordingFilename('video/webm;codecs=vp9,opus', 'video_audio', new Date('2026-08-05T05:00:00Z'));
  assert.ok(name.endsWith('.webm'), name);
  assert.ok(!name.endsWith('.mp4'));
  assert.ok(name.includes('teleprompter-video-'));
  const audioName = buildRecordingFilename('audio/webm;codecs=opus', 'audio_only');
  assert.ok(audioName.endsWith('.webm'));
  assert.ok(audioName.includes('teleprompter-audio-'));
  console.log('PASS extension/filename');
}

section('State transitions');
{
  const ok: Array<[TeleprompterRecorderState, TeleprompterRecorderState]> = [
    ['idle', 'requesting'],
    ['requesting', 'ready'],
    ['ready', 'countdown'],
    ['countdown', 'recording'],
    ['recording', 'paused'],
    ['paused', 'recording'],
    ['recording', 'stopped'],
    ['paused', 'stopped'],
    ['stopped', 'ready'],
    ['stopped', 'countdown'],
    ['error', 'idle'],
    ['error', 'requesting'],
  ];
  for (const [from, to] of ok) {
    assert.equal(canTransition(from, to), true, `${from}→${to}`);
  }
  const bad: Array<[TeleprompterRecorderState, TeleprompterRecorderState]> = [
    ['idle', 'recording'],
    ['ready', 'paused'],
    ['recording', 'countdown'],
    ['stopped', 'recording'], // must countdown or ready first
  ];
  for (const [from, to] of bad) {
    assert.equal(canTransition(from, to), false, `should block ${from}→${to}`);
  }
  console.log('PASS transitions');
}

section('MediaStream cleanup');
{
  const stopped: string[] = [];
  const fakeStream = {
    getTracks: () => [
      { stop: () => stopped.push('v') },
      { stop: () => stopped.push('a') },
    ],
  } as unknown as MediaStream;
  stopMediaStream(fakeStream);
  assert.deepEqual(stopped, ['v', 'a']);
  stopMediaStream(null);
  stopMediaStream(undefined);
  console.log('PASS stop tracks');
}

section('Constraints by mode');
{
  const va = constraintsForMode('video_audio', {});
  assert.ok(va.video);
  assert.ok(va.audio);
  const vo = constraintsForMode('video_only', {});
  assert.ok(vo.video);
  assert.equal(vo.audio, false);
  const ao = constraintsForMode('audio_only', {});
  assert.equal(ao.video, false);
  assert.ok(ao.audio);
  const sc = constraintsForMode('screen_camera', {});
  assert.ok(sc.video);
  assert.ok(sc.audio);
  const withIds = constraintsForMode('video_audio', {
    videoId: 'cam-1',
    audioId: 'mic-1',
  });
  assert.equal(typeof withIds.video, 'object');
  assert.equal(typeof withIds.audio, 'object');
  console.log('PASS constraints');
}

section('Error classification');
{
  const denied = classifyMediaError({ name: 'NotAllowedError', message: 'Permission denied' });
  assert.equal(denied.code, 'permission_denied');
  const noCam = classifyMediaError({ name: 'NotFoundError', message: 'Requested device not found: video' });
  assert.ok(noCam.code === 'no_camera' || noCam.code === 'device_not_found');
  console.log('PASS errors');
}

section('Recorder ↔ Teleprompter sync contract');
{
  /**
   * Sync rules (UI/hook):
   * - countdown ends → onRecordingStart → teleprompter playImmediate
   * - pause recording → onRecordingPause → teleprompter pause
   * - resume recording → onRecordingResume → teleprompter playImmediate
   * - stop → onRecordingStop → teleprompter pause
   */
  type SyncEvent = 'start' | 'pause' | 'resume' | 'stop';
  const events: SyncEvent[] = [];
  const teleprompter = { playing: false };
  const handlers = {
    onRecordingStart: () => {
      teleprompter.playing = true;
      events.push('start');
    },
    onRecordingPause: () => {
      teleprompter.playing = false;
      events.push('pause');
    },
    onRecordingResume: () => {
      teleprompter.playing = true;
      events.push('resume');
    },
    onRecordingStop: () => {
      teleprompter.playing = false;
      events.push('stop');
    },
  };

  // Simulate happy path recorder→tp callbacks
  let recState: TeleprompterRecorderState = 'ready';
  assert.ok(canTransition(recState, 'countdown'));
  recState = 'countdown';
  assert.ok(canTransition(recState, 'recording'));
  recState = 'recording';
  handlers.onRecordingStart();
  assert.equal(teleprompter.playing, true);

  assert.ok(canTransition(recState, 'paused'));
  recState = 'paused';
  handlers.onRecordingPause();
  assert.equal(teleprompter.playing, false);

  assert.ok(canTransition(recState, 'recording'));
  recState = 'recording';
  handlers.onRecordingResume();
  assert.equal(teleprompter.playing, true);

  assert.ok(canTransition(recState, 'stopped'));
  recState = 'stopped';
  handlers.onRecordingStop();
  assert.equal(teleprompter.playing, false);

  assert.deepEqual(events, ['start', 'pause', 'resume', 'stop']);
  console.log('PASS sync callbacks');
}

section('formatRecordingClock');
{
  assert.equal(formatRecordingClock(0), '00:00');
  assert.equal(formatRecordingClock(65), '01:05');
  assert.equal(formatRecordingClock(3661), '01:01:01');
  console.log('PASS clock');
}

section('Quality constraints, size estimate, filename sanitize, unload guard');
{
  assert.deepEqual(qualityToResolution('economy'), {
    width: 1280,
    height: 720,
    label: '720p',
  });
  assert.equal(qualityToResolution('standard').height, 1080);

  const eco = constraintsForMode('video_audio', { quality: 'economy' });
  assert.equal(typeof eco.video, 'object');
  const ecoVid = eco.video as MediaTrackConstraints;
  assert.equal((ecoVid.width as { ideal: number }).ideal, 1280);

  const std = constraintsForMode('video_only', { quality: 'standard', videoId: 'cam' });
  assert.equal(std.audio, false);
  assert.equal(((std.video as MediaTrackConstraints).height as { ideal: number }).ideal, 1080);

  const audioOnly = constraintsForMode('audio_only', {});
  assert.equal(audioOnly.video, false);

  const bytes1m = estimateRecordingBytes(60, 'video_audio', 'economy');
  assert.ok(bytes1m > 1_000_000, '1 min video should estimate > 1MB');
  assert.ok(formatByteSize(bytes1m).includes('MB') || formatByteSize(bytes1m).includes('GB'));

  assert.equal(
    sanitizeRecordingFilename('My Clip!!/../a.mp4', 'video/webm;codecs=vp9,opus'),
    'My Clip!!_.._a.webm',
  );
  assert.ok(sanitizeRecordingFilename('', 'audio/webm').endsWith('.webm'));

  assert.equal(shouldBlockUnload('recording', false), true);
  assert.equal(shouldBlockUnload('paused', false), true);
  assert.equal(shouldBlockUnload('countdown', false), true);
  assert.equal(shouldBlockUnload('stopped', true), true);
  assert.equal(shouldBlockUnload('stopped', false), false);
  assert.equal(shouldBlockUnload('ready', false), false);

  assert.equal(sizeWarningLevel(WARN_SIZE_BYTES), 'warn');
  assert.equal(sizeWarningLevel(0), 'none');
  assert.ok(MAX_RECOMMENDED_SECONDS === 1800);
  assert.ok(permissionRecoverySteps().length >= 3);
  assert.ok(canTransition('ready', 'recording')); // countdown 0
  console.log('PASS quality/size/sanitize/unload');
}

console.log('\nALL_PASS teleprompter-recorder');
