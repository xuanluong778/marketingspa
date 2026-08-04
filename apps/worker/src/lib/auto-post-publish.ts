import { createDecipheriv, scryptSync } from 'crypto';
import {
  formatMetaGraphErrorTechnical,
  formatMetaGraphErrorUserFacing,
  type MetaGraphErrorShape,
} from './auto-post-publish-errors';
import { normalizePublishMedia } from './auto-post-media';

const SALT = 'marketingspa-integration-v1';

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw || raw.length < 16) {
    throw new Error('ENCRYPTION_KEY chưa cấu hình');
  }
  return scryptSync(raw, SALT, 32);
}

export function decryptSecret(encrypted: string): string {
  const buf = Buffer.from(encrypted, 'base64');
  const iv = buf.subarray(0, 16);
  const tag = buf.subarray(16, 32);
  const data = buf.subarray(32);
  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

function throwMetaError(err: MetaGraphErrorShape | undefined, fallback: string): never {
  const shape = err ?? { message: fallback };
  const user = formatMetaGraphErrorUserFacing(shape);
  const tech = formatMetaGraphErrorTechnical(shape);
  throw new Error(user === tech ? user : `${user} (${tech})`);
}

async function fetchPostPermalink(
  postId: string,
  pageAccessToken: string,
  apiVersion: string,
): Promise<string | null> {
  try {
    const url =
      `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(postId)}` +
      `?fields=permalink_url` +
      `&access_token=${encodeURIComponent(pageAccessToken)}`;
    const res = await fetch(url);
    const body = (await res.json()) as { permalink_url?: string; error?: MetaGraphErrorShape };
    if (!res.ok || body.error) return null;
    return body.permalink_url?.trim() || null;
  } catch {
    return null;
  }
}

export async function publishToFacebookPage(
  pageId: string,
  pageAccessToken: string,
  payload: { message: string; link?: string; imageUrl?: string },
  apiVersion = process.env.META_API_VERSION ?? 'v21.0',
): Promise<{ id: string; permalinkUrl: string | null }> {
  const media = normalizePublishMedia({
    imageUrl: payload.imageUrl,
    linkUrl: payload.link,
  });

  let postId: string;
  if (media.imageUrl) {
    const params = new URLSearchParams({
      url: media.imageUrl,
      caption: payload.message,
      published: 'true',
      access_token: pageAccessToken,
    });
    const res = await fetch(
      `https://graph.facebook.com/${apiVersion}/${pageId}/photos?${params.toString()}`,
      { method: 'POST' },
    );
    const body = (await res.json()) as { id?: string; error?: MetaGraphErrorShape };
    if (!res.ok || body.error) {
      throwMetaError(body.error, 'Meta publish failed');
    }
    if (!body.id) throw new Error('Meta không trả về post id');
    postId = body.id;
  } else {
    const reqBody: Record<string, string> = {
      message: payload.message,
      published: 'true',
      access_token: pageAccessToken,
    };
    if (media.linkUrl) reqBody.link = media.linkUrl;

    const res = await fetch(`https://graph.facebook.com/${apiVersion}/${pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    });
    const body = (await res.json()) as { id?: string; error?: MetaGraphErrorShape };
    if (!res.ok || body.error) {
      throwMetaError(body.error, 'Meta publish failed');
    }
    if (!body.id) throw new Error('Meta không trả về post id');
    postId = body.id;
  }

  const permalinkUrl = await fetchPostPermalink(postId, pageAccessToken, apiVersion);
  return { id: postId, permalinkUrl };
}
