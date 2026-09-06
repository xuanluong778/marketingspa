import { createHash, timingSafeEqual } from 'crypto';
import { verifyAmazonSnsMessage } from '@marketingspa/shared';
import { snsTestSigningKey } from '@marketingspa/shared/dist/sns-test-signing';
import {
  expectedSnsTopicArn,
  isAllowedSnsSubscribeUrl,
  parseSesWebhookPayload,
  snsTopicArnFrom,
  type ParsedSesEvent,
} from './ses-webhook.util';

export type SesWebhookAuthResult =
  | { ok: true; envelope: Record<string, unknown>; event: ParsedSesEvent }
  | { ok: false; reason: string; statusCode: number };

function parseEnvelope(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    if (typeof input === 'string') {
      try {
        const parsed = JSON.parse(input) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        return null;
      }
    }
    return null;
  }
  return input as Record<string, unknown>;
}

function verifyTestWebhookHmac(rawBody: string | undefined, testSignature: string | undefined): boolean {
  const key = snsTestSigningKey();
  if (!key || !rawBody || !testSignature) return false;
  const expected = createHash('sha256').update(`${key}:${rawBody}`).digest('hex');
  try {
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(testSignature, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Authenticate SNS webhook: signature + topic ARN (fail-closed). */
export async function authenticateSesWebhook(
  input: unknown,
  opts?: { rawBody?: string; testSignatureHeader?: string },
): Promise<SesWebhookAuthResult> {
  const envelope = parseEnvelope(input);
  if (!envelope) return { ok: false, reason: 'invalid_payload', statusCode: 400 };

  const expectedTopic = expectedSnsTopicArn();
  if (!expectedTopic) {
    return { ok: false, reason: 'missing_topic_arn', statusCode: 403 };
  }

  const topicArn = snsTopicArnFrom(envelope);
  if (!topicArn || topicArn !== expectedTopic) {
    return { ok: false, reason: 'topic_mismatch', statusCode: 403 };
  }

  const rawBody =
    opts?.rawBody ??
    (typeof input === 'string' ? input : JSON.stringify(input));

  const testKey = snsTestSigningKey();
  const testSig = opts?.testSignatureHeader;
  const testAuthOk = testKey && testSig ? verifyTestWebhookHmac(rawBody, testSig) : false;

  if (!testAuthOk) {
    const verified = await verifyAmazonSnsMessage(envelope);
    if (!verified.ok) {
      return { ok: false, reason: verified.reason, statusCode: 403 };
    }
  }

  const event = parseSesWebhookPayload(envelope);
  if (event.kind === 'sns_confirm') {
    if (!event.subscribeUrl || !isAllowedSnsSubscribeUrl(event.subscribeUrl)) {
      return { ok: false, reason: 'invalid_subscribe_url', statusCode: 403 };
    }
  }

  return { ok: true, envelope, event };
}

export { expectedSnsTopicArn };
