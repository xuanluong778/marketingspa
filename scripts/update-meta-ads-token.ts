/**
 * Update Meta Ads AdConnection token + report expiry via debug_token.
 * Never prints the access token.
 *
 * Usage:
 *   META_TOKEN_UPDATE='<token>' node scripts/with-root-env.cjs \
 *     pnpm --filter @marketingspa/database exec tsx ../../scripts/update-meta-ads-token.ts
 *
 * Optional:
 *   ORG_ID=...  (default: most recently updated META AdConnection, else DIGI org)
 *   UPDATE_ENV=1  also patch META_ACCESS_TOKEN in .env
 */
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { prisma, AdConnectionProvider, AdConnectionStatus, FacebookAdsConnectionStatus } from '@marketingspa/database';
import { encodeStoredSecret } from '../apps/api/src/common/utils/token-security.util';

const ROOT = join(__dirname, '..');
const DIGI_ORG = '2b8fa4ec-976e-4ba3-910f-94bf30d2dbce';

function tokenFingerprint(token: string) {
  return createHash('sha256').update(token).digest('hex').slice(0, 12);
}

async function graphGet<T>(url: string): Promise<{ status: number; body: T }> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const body = (await res.json()) as T;
  return { status: res.status, body };
}

async function main() {
  const accessToken = (
    process.env.META_TOKEN_UPDATE ||
    process.env.META_ACCESS_TOKEN ||
    ''
  ).trim();
  if (!accessToken || !accessToken.startsWith('EAA')) {
    console.log(JSON.stringify({ error: 'META_TOKEN_UPDATE/META_ACCESS_TOKEN missing or invalid format' }));
    process.exit(1);
  }

  const appId = process.env.META_APP_ID || process.env.FACEBOOK_APP_ID || '';
  const appSecret = process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET || '';
  const version = process.env.META_API_VERSION || 'v21.0';
  const encKey = process.env.ENCRYPTION_KEY || '';
  if (!appId || !appSecret || !encKey) {
    console.log(JSON.stringify({ error: 'missing META_APP_ID/SECRET or ENCRYPTION_KEY' }));
    process.exit(1);
  }

  // 1) Who am I
  const meRes = await graphGet<{
    id?: string;
    name?: string;
    error?: { message?: string; code?: number };
  }>(`https://graph.facebook.com/${version}/me?fields=id,name&access_token=${encodeURIComponent(accessToken)}`);

  if (meRes.body.error || !meRes.body.id) {
    console.log(
      JSON.stringify({
        error: 'token_invalid_for_me',
        status: meRes.status,
        message: meRes.body.error?.message?.slice(0, 200) ?? 'no id',
        fingerprint: tokenFingerprint(accessToken),
      }),
    );
    process.exit(1);
  }

  // 2) debug_token → expiry
  const debugRes = await graphGet<{
    data?: {
      is_valid?: boolean;
      expires_at?: number;
      data_access_expires_at?: number;
      scopes?: string[];
      type?: string;
      app_id?: string;
      user_id?: string;
      error?: { message?: string };
    };
    error?: { message?: string };
  }>(
    `https://graph.facebook.com/${version}/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`,
  );

  const debug = debugRes.body.data;
  const expiresAtUnix = debug?.expires_at && debug.expires_at > 0 ? debug.expires_at : null;
  const dataAccessUnix =
    debug?.data_access_expires_at && debug.data_access_expires_at > 0
      ? debug.data_access_expires_at
      : null;
  const expiresAt = expiresAtUnix ? new Date(expiresAtUnix * 1000) : null;
  const dataAccessExpiresAt = dataAccessUnix ? new Date(dataAccessUnix * 1000) : null;

  // 3) Ad accounts
  const accountsRes = await graphGet<{
    data?: Array<{ id?: string; name?: string; account_status?: number }>;
    error?: { message?: string };
  }>(
    `https://graph.facebook.com/${version}/me/adaccounts?fields=id,name,account_status&limit=50&access_token=${encodeURIComponent(accessToken)}`,
  );
  const accounts = accountsRes.body.data ?? [];
  if (accountsRes.body.error) {
    console.log(
      JSON.stringify({
        error: 'cannot_list_adaccounts',
        message: accountsRes.body.error.message?.slice(0, 200),
        me: { id: meRes.body.id, name: meRes.body.name },
        fingerprint: tokenFingerprint(accessToken),
        isValid: debug?.is_valid ?? null,
        expiresAt: expiresAt?.toISOString() ?? null,
        expiresNote: expiresAtUnix === null ? 'never_or_not_set (0 = không hết hạn theo debug_token)' : null,
        dataAccessExpiresAt: dataAccessExpiresAt?.toISOString() ?? null,
        scopes: debug?.scopes ?? [],
      }),
    );
    process.exit(1);
  }

  // Prefer existing connection's selected account, else first account
  let orgId = process.env.ORG_ID?.trim() || '';
  let existing = orgId
    ? await prisma.adConnection.findUnique({
        where: {
          organizationId_provider: { organizationId: orgId, provider: AdConnectionProvider.META },
        },
      })
    : await prisma.adConnection.findFirst({
        where: { provider: AdConnectionProvider.META, organizationId: DIGI_ORG },
      });

  if (!existing && !orgId) {
    existing = await prisma.adConnection.findFirst({
      where: { provider: AdConnectionProvider.META },
      orderBy: { updatedAt: 'desc' },
    });
  }

  orgId = orgId || existing?.organizationId || DIGI_ORG;

  const user = await prisma.user.findFirst({
    where: { organizationId: orgId, isActive: true, deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  if (!user) {
    console.log(JSON.stringify({ error: 'no_user_in_org', orgId }));
    process.exit(1);
  }

  const preferredId = existing?.externalAccountId;
  const selected =
    accounts.find((a) => a.id === preferredId) ||
    accounts.find((a) => a.id?.includes('103244355239559')) ||
    accounts[0];

  if (!selected?.id) {
    console.log(
      JSON.stringify({
        error: 'no_ad_account_on_token',
        me: { id: meRes.body.id, name: meRes.body.name },
        accountCount: accounts.length,
        isValid: debug?.is_valid ?? null,
        expiresAt: expiresAt?.toISOString() ?? null,
        scopes: debug?.scopes ?? [],
      }),
    );
    process.exit(1);
  }

  const encryptedCredentials = encodeStoredSecret(
    JSON.stringify({ accessToken }),
    encKey,
  );

  const scopes = Array.from(
    new Set([...(debug?.scopes ?? []), 'ads_read', 'ads_management'].filter(Boolean)),
  );

  await prisma.adConnection.upsert({
    where: {
      organizationId_provider: {
        organizationId: orgId,
        provider: AdConnectionProvider.META,
      },
    },
    create: {
      userId: user.id,
      organizationId: orgId,
      provider: AdConnectionProvider.META,
      status: AdConnectionStatus.CONNECTED,
      encryptedCredentials,
      tokenExpiresAt: expiresAt,
      scopes,
      externalAccountId: selected.id,
      externalAccountName: selected.name ?? selected.id,
      metadata: {
        facebookUserId: meRes.body.id,
        legacyTokenCipher: false,
        connectMode: 'manual_token',
        tokenFingerprint: tokenFingerprint(accessToken),
        updatedVia: 'scripts/update-meta-ads-token.ts',
      },
    },
    update: {
      userId: user.id,
      status: AdConnectionStatus.CONNECTED,
      encryptedCredentials,
      tokenExpiresAt: expiresAt,
      scopes,
      externalAccountId: selected.id,
      externalAccountName: selected.name ?? selected.id,
      lastError: null,
      metadata: {
        facebookUserId: meRes.body.id,
        legacyTokenCipher: false,
        connectMode: 'manual_token',
        tokenFingerprint: tokenFingerprint(accessToken),
        updatedVia: 'scripts/update-meta-ads-token.ts',
      },
    },
  });

  await prisma.facebookAdsConnection.upsert({
    where: { organizationId: orgId },
    create: {
      organizationId: orgId,
      connectedByUserId: user.id,
      facebookUserId: meRes.body.id!,
      selectedAdAccountId: selected.id,
      selectedAdAccountName: selected.name ?? selected.id,
      status: FacebookAdsConnectionStatus.CONNECTED,
      scopes,
    },
    update: {
      connectedByUserId: user.id,
      facebookUserId: meRes.body.id!,
      selectedAdAccountId: selected.id,
      selectedAdAccountName: selected.name ?? selected.id,
      status: FacebookAdsConnectionStatus.CONNECTED,
      scopes,
      lastSyncError: null,
    },
  });

  let envUpdated = false;
  if (process.env.UPDATE_ENV === '1') {
    const envPath = join(ROOT, '.env');
    if (existsSync(envPath)) {
      let env = readFileSync(envPath, 'utf8');
      if (/^META_ACCESS_TOKEN=.*/m.test(env)) {
        env = env.replace(/^META_ACCESS_TOKEN=.*/m, `META_ACCESS_TOKEN=${accessToken}`);
      } else {
        env += `\nMETA_ACCESS_TOKEN=${accessToken}\n`;
      }
      writeFileSync(envPath, env, 'utf8');
      envUpdated = true;
    }
  }

  const now = Date.now();
  const daysLeft = expiresAt
    ? Math.round(((expiresAt.getTime() - now) / 86400000) * 10) / 10
    : null;

  console.log(
    JSON.stringify(
      {
        ok: true,
        orgId,
        userEmail: user.email,
        facebookUser: { id: meRes.body.id, name: meRes.body.name },
        adAccount: { id: selected.id, name: selected.name ?? null },
        adAccountsOnToken: accounts.map((a) => ({ id: a.id, name: a.name })),
        token: {
          fingerprint: tokenFingerprint(accessToken),
          isValid: debug?.is_valid ?? null,
          type: debug?.type ?? null,
          appId: debug?.app_id ?? null,
          scopes: debug?.scopes ?? [],
          expiresAt: expiresAt?.toISOString() ?? null,
          expiresAtUnix: expiresAtUnix,
          expiresNote:
            expiresAtUnix === null || expiresAtUnix === 0
              ? 'expires_at=0 → token dài hạn / không có hạn cố định theo debug_token (thường là long-lived hoặc không hết hạn theo field này)'
              : `còn khoảng ${daysLeft} ngày`,
          dataAccessExpiresAt: dataAccessExpiresAt?.toISOString() ?? null,
          daysLeft,
        },
        envUpdated,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(String(e).replace(/EAA[A-Za-z0-9]+/g, '[token]').slice(0, 400));
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
