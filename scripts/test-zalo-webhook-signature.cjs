/**
 * Quick unit checks for Zalo OA webhook signature + normalize (no network).
 * Run: node -r ts-node/register ... OR via compiled dist after shared build.
 */
const {
  buildZaloWebhookMacHex,
  verifyZaloWebhookSignature,
  normalizeZaloWebhook,
} = require('../packages/shared/dist');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
  console.log('OK:', msg);
}

const appId = '1234567890';
const oaSecret = 'oa-secret-test-key';
const timestamp = '1602560967477';
const bodyObj = {
  event_name: 'user_send_text',
  app_id: appId,
  oa_id: '9876543210',
  timestamp,
  sender: { id: 'user-1', name: 'Test' },
  message: { text: 'xin chao', msg_id: 'msg-1' },
};
const raw = JSON.stringify(bodyObj);
const mac = buildZaloWebhookMacHex({ appId, rawBody: raw, timestamp, oaSecretKey: oaSecret });
assert(
  verifyZaloWebhookSignature({
    rawBody: raw,
    signature: `mac=${mac}`,
    appId,
    timestamp,
    oaSecretKey: oaSecret,
    allowLegacyHmac: false,
  }),
  'official mac verifies',
);
assert(
  !verifyZaloWebhookSignature({
    rawBody: raw,
    signature: `mac=${'0'.repeat(64)}`,
    appId,
    timestamp,
    oaSecretKey: oaSecret,
    allowLegacyHmac: false,
  }),
  'bad mac rejected',
);

const textEv = normalizeZaloWebhook(bodyObj, '9876543210');
assert(textEv.length === 1 && textEv[0].eventType === 'message', 'user_send_text');

const imageEv = normalizeZaloWebhook(
  {
    event_name: 'user_send_image',
    oa_id: '9876543210',
    timestamp,
    sender: { id: 'user-1' },
    message: { msg_id: 'img-1' },
  },
  '9876543210',
);
assert(imageEv[0]?.text === '[image]', 'user_send_image');

const followEv = normalizeZaloWebhook(
  {
    event_name: 'follow',
    oa_id: '9876543210',
    timestamp,
    follower: { id: 'user-2' },
  },
  '9876543210',
);
assert(followEv[0]?.eventType === 'follow', 'follow');

const seenEv = normalizeZaloWebhook(
  {
    event_name: 'user_seen_message',
    oa_id: '9876543210',
    timestamp,
    sender: { id: 'user-1' },
    message: { msg_id: 'm9' },
  },
  '9876543210',
);
assert(seenEv[0]?.eventType === 'read', 'user_seen_message');

const oaSend = normalizeZaloWebhook(
  {
    event_name: 'oa_send_text',
    oa_id: '9876543210',
    timestamp,
    sender: { id: '9876543210' },
    recipient: { id: 'user-1' },
    message: { text: 'hello', msg_id: 'out-1' },
  },
  '9876543210',
);
assert(oaSend[0]?.direction === 'outbound', 'oa_send_text outbound');

console.log('ALL UNIT CHECKS PASS');
