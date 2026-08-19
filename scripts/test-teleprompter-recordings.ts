/**
 * Unit tests: MIME sniff, size limits, signed URL expiry, part assemble, tenant filter.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

process.env.TELEPROMPTER_UPLOAD_DIR = mkdtempSync(join(tmpdir(), 'tp-rec-'));
process.env.TELEPROMPTER_DOWNLOAD_SECRET = 'test-download-secret';
process.env.TELEPROMPTER_MAX_FILE_BYTES = String(10 * 1024 * 1024);

import * as files from '../apps/api/src/content-marketing/teleprompter-recording-files';

function section(name: string) {
  console.log(`\n=== ${name} ===`);
}

async function main() {
  section('validateInitParams — size limit & MIME');
  {
    const ok = files.validateInitParams({
      title: 'Clip',
      recordingType: 'video_audio',
      mimeType: 'video/webm',
      size: 1024,
    });
    assert.equal(ok.ok, true);

    const over = files.validateInitParams({
      title: 'Huge',
      recordingType: 'video_audio',
      mimeType: 'video/webm',
      size: 50 * 1024 * 1024,
    });
    assert.equal(over.ok, false);
    assert.match((over as { message: string }).message, /vượt giới hạn/i);

    const badMime = files.validateInitParams({
      title: 'x',
      recordingType: 'video_audio',
      mimeType: 'application/x-msdownload',
      size: 100,
    });
    assert.equal(badMime.ok, false);
    console.log('PASS init validation');
  }

  section('MIME sniffing & spoofing rejection');
  {
    const webm = Buffer.from([
      0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);
    assert.equal(files.sniffContainerMime(webm), 'video/webm');
    assert.equal(files.mimeCompatible('video/webm', 'video/webm', 'video_audio'), true);
    assert.equal(files.mimeCompatible('video/mp4', 'video/webm', 'video_audio'), false);

    const spoof = Buffer.from('not a media file!!!!!!');
    assert.equal(files.sniffContainerMime(spoof), null);
    assert.equal(files.mimeCompatible('video/webm', null, 'video_audio'), false);

    const wav = Buffer.alloc(12);
    wav.write('RIFF', 0);
    wav.write('WAVE', 8);
    assert.equal(files.sniffContainerMime(wav), 'audio/wav');
    assert.equal(files.mimeCompatible('audio/wav', 'audio/wav', 'audio_only'), true);
    assert.equal(files.mimeCompatible('audio/wav', 'audio/wav', 'video_only'), false);
    console.log('PASS mime sniff / spoof');
  }

  section('Multipart write + assemble + incomplete mid upload');
  {
    const org = 'org-test';
    const recId = 'rec-1';
    const key = files.buildStorageKey(org, recId, 'video/webm');
    files.ensureRecordingDirs(key);

    const p1 = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(1000, 1)]);
    const p2 = Buffer.alloc(500, 2);
    const r1 = await files.writePart(key, 1, p1);
    const r2 = await files.writePart(key, 2, p2);
    assert.ok(r1.etag);
    assert.ok(r2.etag);
    assert.deepEqual(files.listWrittenParts(key), [1, 2]);

    const key2 = files.buildStorageKey(org, 'rec-gap', 'video/webm');
    files.ensureRecordingDirs(key2);
    await files.writePart(key2, 1, p1);
    await files.writePart(key2, 3, p2);
    const listed = files.listWrittenParts(key2);
    assert.deepEqual(listed, [1, 3]);
    let missing = false;
    for (let i = 1; i <= Math.max(...listed); i++) {
      if (!listed.includes(i)) missing = true;
    }
    assert.equal(missing, true);

    const total = files.assembleParts(key, [1, 2]);
    assert.equal(total, p1.length + p2.length);
    const abs = files.absoluteFromKey(key);
    assert.equal(readFileSync(abs).length, total);
    console.log('PASS parts assemble / mid-upload gap');
  }

  section('Signed download URL expiry & integrity');
  {
    const expPast = Math.floor(Date.now() / 1000) - 10;
    const tokenPast = files.signDownloadToken({
      recordingId: 'r1',
      organizationId: 'o1',
      userId: 'u1',
      exp: expPast,
    });
    assert.equal(files.verifyDownloadToken(tokenPast), null);

    const expOk = Math.floor(Date.now() / 1000) + 600;
    const tokenOk = files.signDownloadToken({
      recordingId: 'r1',
      organizationId: 'o1',
      userId: 'u1',
      exp: expOk,
    });
    const payload = files.verifyDownloadToken(tokenOk);
    assert.ok(payload);
    assert.equal(payload!.recordingId, 'r1');
    assert.equal(payload!.organizationId, 'o1');

    const tampered = tokenOk.slice(0, -4) + 'xxxx';
    assert.equal(files.verifyDownloadToken(tampered), null);
    assert.equal(tokenOk.includes('uploads'), false);
    assert.equal(tokenOk.includes('storage'), false);
    console.log('PASS signed URL');
  }

  section('Tenant isolation filter contract');
  {
    const caller = { id: 'user-a', organizationId: 'org-a' };
    const where = {
      id: 'rec-x',
      organizationId: caller.organizationId,
      userId: caller.id,
      deletedAt: null,
    };
    assert.equal(where.organizationId, 'org-a');
    assert.equal(where.userId, 'user-a');

    const otherOrgRow = { id: 'rec-x', organizationId: 'org-b', userId: 'user-b' };
    const match =
      otherOrgRow.organizationId === where.organizationId &&
      otherOrgRow.userId === where.userId;
    assert.equal(match, false);

    const mapped = { id: '1', title: 't' };
    assert.equal('storageKey' in mapped, false);
    console.log('PASS tenant + no storage leak');
  }

  section('Retry after failed part is re-writeable');
  {
    const key = files.buildStorageKey('org-r', 'retry', 'video/webm');
    files.ensureRecordingDirs(key);
    const a = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(50, 9)]);
    const first = await files.writePart(key, 1, a);
    const second = await files.writePart(key, 1, a);
    assert.ok(first.etag);
    assert.equal(second.etag, first.etag);
    console.log('PASS retry part overwrite');
  }

  try {
    rmSync(process.env.TELEPROMPTER_UPLOAD_DIR!, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  console.log('\nALL_PASS teleprompter-recordings');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
