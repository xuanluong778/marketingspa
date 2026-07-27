import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { encryptSecret, decryptSecret } from '../common/utils/encryption.util';
import { AutoPostFacebookConnectionStatus } from '@marketingspa/database';

export const AUTO_POST_OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 phút

export type OAuthStateInfo = {
  userId: string;
  organizationId: string;
  nonce: string;
  ts: number;
  stateHash: string;
};

export type OAuthPublicPage = {
  id: string;
  pageId: string;
  pageName: string;
  pagePictureUrl: string | null;
};

export type MetaPageAccount = {
  id: string;
  name: string;
  access_token: string;
  picture?: { data?: { url?: string } };
};

export async function createOAuthStateRecord(
  prisma: any,
  params: {
    userId: string;
    organizationId: string;
    encryptionKey: string;
    ttlMs?: number;
  },
): Promise<{ state: string }> {
  const ttlMs = params.ttlMs ?? AUTO_POST_OAUTH_STATE_TTL_MS;
  const ts = Date.now();
  const nonce = randomBytes(16).toString('hex');
  const stateHash = createHash('sha256').update(nonce).digest('hex');
  const payload = `${params.userId}:${params.organizationId}:${ts}:${nonce}`;
  const sig = createHmac('sha256', params.encryptionKey).update(payload).digest('hex');

  const expiresAt = new Date(ts + ttlMs);
  const state = Buffer.from(`${payload}:${sig}`).toString('base64url');

  await prisma.autoPostFacebookOAuthState.create({
    data: {
      stateHash,
      userId: params.userId,
      organizationId: params.organizationId,
      nonce,
      expiresAt,
    },
  });

  return { state };
}

export function verifyOAuthState(
  state: string,
  params: { encryptionKey: string; ttlMs?: number },
): OAuthStateInfo {
  const ttlMs = params.ttlMs ?? AUTO_POST_OAUTH_STATE_TTL_MS;
  const decoded = Buffer.from(state, 'base64url').toString('utf8');
  const parts = decoded.split(':');
  if (parts.length !== 5) throw new Error('invalid_state');
  const [userId, organizationId, tsStr, nonce, sig] = parts;
  const ts = Number(tsStr);
  if (!userId || !organizationId || !nonce || !Number.isFinite(ts) || !sig) {
    throw new Error('invalid_state');
  }
  if (Date.now() - ts > ttlMs) throw new Error('oauth_state_expired');

  const payload = `${userId}:${organizationId}:${tsStr}:${nonce}`;
  const expected = createHmac('sha256', params.encryptionKey).update(payload).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('invalid_state');

  const stateHash = createHash('sha256').update(nonce).digest('hex');
  return { userId, organizationId, nonce, ts, stateHash };
}

export async function consumeOAuthStateRecord(
  prisma: any,
  params: { state: string; encryptionKey: string; ttlMs?: number; now?: Date },
): Promise<OAuthStateInfo> {
  const now = params.now ?? new Date();
  const info = verifyOAuthState(params.state, { encryptionKey: params.encryptionKey, ttlMs: params.ttlMs });

  const consumed = await prisma.autoPostFacebookOAuthState.updateMany({
    where: { stateHash: info.stateHash, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });

  if (consumed.count !== 1) {
    throw new Error('oauth_state_used_or_expired');
  }

  return info;
}

export async function oauthCallbackConnect(
  prisma: any,
  params: {
    code: string;
    state: string;
    encryptionKey: string;
    meta: {
      exchangeCodeForToken: (code: string) => Promise<{ access_token: string; expires_in?: number }>;
      exchangeForLongLivedToken: (shortLivedToken: string) => Promise<{ access_token: string; expires_in?: number }>;
      getMe: (accessToken: string) => Promise<{ id: string; name?: string }>;
      getOAuthScopes: () => string[];
    };
  },
): Promise<void> {
  const encryptionKey = params.encryptionKey;
  const info = await consumeOAuthStateRecord(prisma, { state: params.state, encryptionKey });

  try {
    const short = await params.meta.exchangeCodeForToken(params.code);
    const longLived = await params.meta.exchangeForLongLivedToken(short.access_token);
    const accessToken = longLived.access_token;
    const me = await params.meta.getMe(accessToken);

    const expiresAt = longLived.expires_in ? new Date(Date.now() + longLived.expires_in * 1000) : null;
    const encryptedAccessToken = encryptSecret(accessToken, encryptionKey);

    // Phase 3: chỉ lưu pending, không ghi đè active connection/page.
    await prisma.autoPostFacebookOAuthPendingConnection.upsert({
      where: { userId_organizationId: { userId: info.userId, organizationId: info.organizationId } },
      create: {
        userId: info.userId,
        organizationId: info.organizationId,
        encryptedAccessToken,
        tokenExpiresAt: expiresAt,
        facebookUserId: me.id,
        facebookUserName: me.name ?? null,
        scopes: params.meta.getOAuthScopes(),
        lastError: null,
      },
      update: {
        encryptedAccessToken,
        tokenExpiresAt: expiresAt,
        facebookUserId: me.id,
        facebookUserName: me.name ?? null,
        scopes: params.meta.getOAuthScopes(),
        lastError: null,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'oauth_failed';
    const safeMsg = msg
      .replace(/access_token\s*=\s*[^\s&]+/gi, 'access_token=[redacted]')
      .slice(0, 300);

    // Callback lỗi: không ghi đè active connection/page (giữ trạng thái cũ).
    // Nếu pending tồn tại từ trước, service/FE xử lý bằng redirect error.

    throw e;
  }
}

export async function listOAuthManagedPages(
  prisma: any,
  params: {
    userId: string;
    organizationId: string;
    encryptionKey: string;
    meta: { getManagedPages: (accessToken: string) => Promise<MetaPageAccount[]> };
  },
): Promise<OAuthPublicPage[]> {
  const pending = await prisma.autoPostFacebookOAuthPendingConnection.findUnique({
    where: { userId_organizationId: { userId: params.userId, organizationId: params.organizationId } },
  });
  if (!pending) throw new Error('Chưa có OAuth pending — vui lòng kết nối lại');

  if (pending.tokenExpiresAt && pending.tokenExpiresAt.getTime() < Date.now()) {
    throw new Error('Token Facebook đã hết hạn — vui lòng kết nối lại');
  }

  const accessToken = decryptSecret(pending.encryptedAccessToken, params.encryptionKey);
  const pages = await params.meta.getManagedPages(accessToken);

  return pages.map((p) => ({
    id: p.id,
    pageId: p.id,
    pageName: p.name,
    pagePictureUrl: p.picture?.data?.url ?? null,
  }));
}

export async function selectOAuthPage(
  prisma: any,
  params: {
    userId: string;
    organizationId: string;
    pageId: string;
    encryptionKey: string;
    meta: {
      getManagedPages: (accessToken: string) => Promise<MetaPageAccount[]>;
      debugToken: (accessToken: string) => Promise<{ is_valid: boolean; expires_at?: number; scopes?: string[] }>;
    };
  },
): Promise<void> {
  const pageId = params.pageId?.trim();
  if (!pageId) throw new Error('pageId is required');

  const pending = await prisma.autoPostFacebookOAuthPendingConnection.findUnique({
    where: { userId_organizationId: { userId: params.userId, organizationId: params.organizationId } },
  });
  if (!pending) throw new Error('Chưa có OAuth pending — vui lòng kết nối lại');

  if (pending.tokenExpiresAt && pending.tokenExpiresAt.getTime() < Date.now()) {
    throw new Error('Token Facebook đã hết hạn — vui lòng kết nối lại');
  }

  const accessToken = decryptSecret(pending.encryptedAccessToken, params.encryptionKey);
  const pages = await params.meta.getManagedPages(accessToken);
  const chosen = pages.find((p) => p.id === pageId);
  if (!chosen) throw new Error('Fanpage không thuộc quyền của bạn');

  // Phase 3: Graph xác minh page token + granted permissions
  const debug = await params.meta.debugToken(chosen.access_token);
  const grantedScopes = debug.scopes ?? [];

  if (!debug.is_valid) throw new Error('Token Facebook đã hết hạn — vui lòng kết nối lại');
  if (debug.expires_at && debug.expires_at * 1000 < Date.now()) {
    throw new Error('Token Facebook đã hết hạn — vui lòng kết nối lại');
  }
  if (!grantedScopes.includes('pages_manage_posts')) {
    throw new Error('MISSING_PERMISSION');
  }

  const tokenExpiresAt = debug.expires_at ? new Date(debug.expires_at * 1000) : pending.tokenExpiresAt;
  const encryptedPageAccessToken = encryptSecret(chosen.access_token, params.encryptionKey);

  await prisma.$transaction(async (tx: any) => {
    const newConn = await tx.autoPostFacebookConnection.upsert({
      where: { userId_organizationId: { userId: params.userId, organizationId: params.organizationId } },
      create: {
        userId: params.userId,
        organizationId: params.organizationId,
        encryptedAccessToken: pending.encryptedAccessToken,
        tokenExpiresAt,
        facebookUserId: pending.facebookUserId,
        facebookUserName: pending.facebookUserName,
        status: AutoPostFacebookConnectionStatus.CONNECTED,
        scopes: grantedScopes,
        lastError: null,
      },
      update: {
        encryptedAccessToken: pending.encryptedAccessToken,
        tokenExpiresAt,
        facebookUserId: pending.facebookUserId,
        facebookUserName: pending.facebookUserName,
        status: AutoPostFacebookConnectionStatus.CONNECTED,
        scopes: grantedScopes,
        lastError: null,
      },
    });

    await tx.autoPostFacebookPage.deleteMany({ where: { connectionId: newConn.id } });

    await tx.autoPostFacebookPage.create({
      data: {
        userId: params.userId,
        connectionId: newConn.id,
        pageId: chosen.id,
        pageName: chosen.name,
        pagePictureUrl: chosen.picture?.data?.url ?? null,
        encryptedPageAccessToken,
      },
    });

    await tx.autoPostFacebookOAuthPendingConnection.delete({
      where: { userId_organizationId: { userId: params.userId, organizationId: params.organizationId } },
    });
  });
}

