import {
  MessageChannel,
  MessagingChannelAccountStatus,
  MessagingProviderKind,
  prisma,
  type Prisma,
} from '@marketingspa/database';
import { refreshZaloOaAccessToken } from '@marketingspa/shared';
import {
  encryptConnectionCredentials,
  parseConnectionCredentials,
} from './encryption';

/** Refresh trước khi hết hạn ~45 phút (trong khoảng 30–60 phút theo yêu cầu). */
export const ZALO_OA_REFRESH_SKEW_MS = 45 * 60_000;

/** Số lần fail liên tiếp trước khi đánh EXPIRED (không còn retry hữu ích). */
const MAX_REFRESH_FAILS = 5;

export type ZaloRefreshResult = {
  connectionId: string;
  organizationId: string;
  accountRefMasked: string;
  refreshed: boolean;
  skipped?: boolean;
  reason?: string;
  status?: MessagingChannelAccountStatus;
};

function maskOa(oaId: string): string {
  if (!oaId) return '••••';
  return `••••${oaId.slice(-4)}`;
}

function readMeta(row: { metadata: unknown }): Record<string, unknown> {
  return row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
    ? { ...(row.metadata as Record<string, unknown>) }
    : {};
}

/**
 * Refresh một OA connection (multi-tenant theo organizationId trên row).
 * Lưu access + refresh token mới (encrypted). Không log plaintext token.
 */
export async function refreshZaloOaConnection(connectionId: string): Promise<ZaloRefreshResult> {
  const row = await prisma.messagingChannelConnection.findUnique({
    where: { id: connectionId },
  });
  if (
    !row ||
    row.channel !== MessageChannel.ZALO ||
    row.providerKind !== MessagingProviderKind.ZALO_OA
  ) {
    return {
      connectionId,
      organizationId: '',
      accountRefMasked: '••••',
      refreshed: false,
      skipped: true,
      reason: 'not_zalo_oa',
    };
  }

  const base = {
    connectionId: row.id,
    organizationId: row.organizationId,
    accountRefMasked: maskOa(row.accountRef),
  };

  if (row.status !== MessagingChannelAccountStatus.ACTIVE) {
    return {
      ...base,
      refreshed: false,
      skipped: true,
      reason: row.status === MessagingChannelAccountStatus.DISCONNECTED ? 'disconnected' : 'not_active',
    };
  }

  if (row.isPaused) {
    return { ...base, refreshed: false, skipped: true, reason: 'paused' };
  }

  let credentials: Record<string, string>;
  try {
    credentials = parseConnectionCredentials(row.encryptedCredentials);
  } catch {
    await prisma.messagingChannelConnection.update({
      where: { id: row.id },
      data: { status: MessagingChannelAccountStatus.REFRESH_FAILED },
    });
    return { ...base, refreshed: false, reason: 'decrypt_failed', status: 'REFRESH_FAILED' };
  }

  const accessToken = (credentials.accessToken || credentials.oaAccessToken || '').trim();
  const refreshToken = (credentials.refreshToken || '').trim();
  const expiresAt =
    row.tokenExpiresAt ||
    (credentials.accessTokenExpiresAt ? new Date(credentials.accessTokenExpiresAt) : null);
  const now = Date.now();
  const expired = Boolean(expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= now);

  if (!refreshToken) {
    const status = expired
      ? MessagingChannelAccountStatus.EXPIRED
      : MessagingChannelAccountStatus.REFRESH_FAILED;
    await prisma.messagingChannelConnection.update({
      where: { id: row.id },
      data: { status },
    });
    return { ...base, refreshed: false, reason: 'missing_refresh_token', status };
  }

  const appId = (process.env.ZALO_APP_ID || '').trim();
  const appSecret = (process.env.ZALO_APP_SECRET || '').trim();
  const stub = process.env.ZALO_TOKEN_REFRESH_STUB === '1';

  if (!stub && (!appId || !appSecret)) {
    await prisma.messagingChannelConnection.update({
      where: { id: row.id },
      data: { status: MessagingChannelAccountStatus.REFRESH_FAILED },
    });
    return { ...base, refreshed: false, reason: 'missing_app_credentials', status: 'REFRESH_FAILED' };
  }

  try {
    let refreshed: {
      accessToken: string;
      refreshToken?: string;
      expiresAt: Date | null;
    };

    if (stub) {
      // Test-only: không gọi Zalo, không log token
      const expires = new Date(Date.now() + 25 * 3600_000);
      refreshed = {
        accessToken: `stub-access-${Date.now()}`,
        refreshToken: `stub-refresh-${Date.now()}`,
        expiresAt: expires,
      };
    } else {
      refreshed = await refreshZaloOaAccessToken({
        appId,
        appSecret,
        refreshToken,
      });
    }

    const next: Record<string, string> = {
      ...credentials,
      accessToken: refreshed.accessToken,
      // Zalo có thể trả refresh token mới — luôn lưu đè khi có
      refreshToken: refreshed.refreshToken?.trim() || refreshToken,
    };
    if (refreshed.expiresAt) {
      next.accessTokenExpiresAt = refreshed.expiresAt.toISOString();
    }

    const meta = readMeta(row);
    meta.lastRefreshAt = new Date().toISOString();
    meta.refreshFailCount = 0;
    delete meta.lastRefreshError;

    await prisma.messagingChannelConnection.update({
      where: { id: row.id },
      data: {
        encryptedCredentials: encryptConnectionCredentials(next),
        tokenExpiresAt: refreshed.expiresAt,
        status: MessagingChannelAccountStatus.ACTIVE,
        lastSyncedAt: new Date(),
        isPaused: false,
        metadata: meta as Prisma.InputJsonValue,
      },
    });

    return {
      ...base,
      refreshed: true,
      status: MessagingChannelAccountStatus.ACTIVE,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'refresh_failed';
    const meta = readMeta(row);
    const failCount = Number(meta.refreshFailCount || 0) + 1;
    meta.refreshFailCount = failCount;
    meta.lastRefreshError = message.slice(0, 200);
    meta.lastRefreshAt = new Date().toISOString();

    const permanent =
      /invalid|revoked|expired refresh|unauthorized|permission|reauth/i.test(message) ||
      failCount >= MAX_REFRESH_FAILS;
    const status = permanent
      ? expired || failCount >= MAX_REFRESH_FAILS
        ? MessagingChannelAccountStatus.EXPIRED
        : MessagingChannelAccountStatus.REFRESH_FAILED
      : MessagingChannelAccountStatus.REFRESH_FAILED;

    await prisma.messagingChannelConnection.update({
      where: { id: row.id },
      data: {
        status,
        metadata: meta as Prisma.InputJsonValue,
      },
    });

    // Không log token — chỉ masked OA + reason
    console.warn(
      `[zalo-refresh] FAIL org=${row.organizationId.slice(0, 8)}… oa=${maskOa(row.accountRef)} status=${status} fails=${failCount}`,
    );

    return { ...base, refreshed: false, reason: message.slice(0, 120), status };
  }
}

/**
 * Đảm bảo access token còn hạn trước khi gửi tin (lazy refresh).
 * Skew 45 phút.
 */
export async function ensureFreshZaloAccessToken(connectionId: string): Promise<{
  accessToken: string;
  refreshed: boolean;
}> {
  const row = await prisma.messagingChannelConnection.findUnique({
    where: { id: connectionId },
  });
  if (!row || row.providerKind !== MessagingProviderKind.ZALO_OA) {
    return { accessToken: '', refreshed: false };
  }

  if (row.status === MessagingChannelAccountStatus.DISCONNECTED) {
    return { accessToken: '', refreshed: false };
  }

  if (row.status !== MessagingChannelAccountStatus.ACTIVE) {
    return { accessToken: '', refreshed: false };
  }

  const credentials = parseConnectionCredentials(row.encryptedCredentials);
  if (credentials._oauthDisabled === '1' || !credentials.refreshToken?.trim()) {
    return { accessToken: '', refreshed: false };
  }
  const accessToken = (credentials.accessToken || credentials.oaAccessToken || '').trim();
  const refreshToken = (credentials.refreshToken || '').trim();
  const expiresAt =
    row.tokenExpiresAt ||
    (credentials.accessTokenExpiresAt ? new Date(credentials.accessTokenExpiresAt) : null);

  const needsRefresh =
    Boolean(refreshToken) &&
    (!expiresAt ||
      Number.isNaN(expiresAt.getTime()) ||
      expiresAt.getTime() - Date.now() < ZALO_OA_REFRESH_SKEW_MS);

  if (!needsRefresh) {
    return { accessToken, refreshed: false };
  }

  const result = await refreshZaloOaConnection(connectionId);
  if (!result.refreshed) {
    return { accessToken, refreshed: false };
  }

  const again = await prisma.messagingChannelConnection.findUnique({
    where: { id: connectionId },
  });
  const nextCreds = parseConnectionCredentials(again?.encryptedCredentials);
  return {
    accessToken: (nextCreds.accessToken || '').trim(),
    refreshed: true,
  };
}

/**
 * Chọn OA cần refresh: chỉ ACTIVE, có credentials, hết hạn trong ≤45 phút (hoặc đã hết hạn).
 */
export async function listZaloOaConnectionsDueForRefresh(limit = 50) {
  const skewDeadline = new Date(Date.now() + ZALO_OA_REFRESH_SKEW_MS);
  return prisma.messagingChannelConnection.findMany({
    where: {
      channel: MessageChannel.ZALO,
      providerKind: MessagingProviderKind.ZALO_OA,
      isPaused: false,
      encryptedCredentials: { not: null },
      status: MessagingChannelAccountStatus.ACTIVE,
      OR: [
        { tokenExpiresAt: null },
        { tokenExpiresAt: { lte: skewDeadline } },
      ],
    },
    select: {
      id: true,
      organizationId: true,
      accountRef: true,
      tokenExpiresAt: true,
      status: true,
    },
    take: limit,
    orderBy: [{ tokenExpiresAt: 'asc' }, { updatedAt: 'asc' }],
  });
}
