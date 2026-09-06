/**
 * Live Google Ads permission diagnostic (no secrets in output).
 * Run: node scripts/with-root-env.cjs node scripts/diag-google-ads-permission.cjs
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');

function loadEnv() {
  const envPath = path.join(root, '.env');
  const out = { ...process.env };
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    const key = m[1].trim();
    // Prefer .env for Google Ads keys so stale shell exports (e.g. old v18) cannot poison the probe
    if (
      out[key] === undefined ||
      key === 'GOOGLE_ADS_API_VERSION' ||
      key === 'GOOGLE_ADS_DEVELOPER_TOKEN' ||
      key === 'GOOGLE_CLIENT_ID' ||
      key === 'GOOGLE_CLIENT_SECRET' ||
      key === 'ENCRYPTION_KEY' ||
      key === 'DATABASE_URL'
    ) {
      out[key] = v;
    }
  }
  return out;
}

function decryptSecret(cipherText, key) {
  const derived = crypto.scryptSync(key, 'marketingspa-integration-v1', 32);
  const buf = Buffer.from(cipherText, 'base64');
  const iv = buf.subarray(0, 16);
  const tag = buf.subarray(16, 32);
  const data = buf.subarray(32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', derived, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

function mask(s) {
  if (!s) return 'MISSING';
  return `SET(len=${String(s).length})`;
}

async function main() {
  const env = loadEnv();
  const report = {
    envVersion: env.GOOGLE_ADS_API_VERSION || null,
    clientId: env.GOOGLE_CLIENT_ID ? `${env.GOOGLE_CLIENT_ID.slice(0, 12)}…` : 'MISSING',
    clientSecret: mask(env.GOOGLE_CLIENT_SECRET),
    developerToken: mask(env.GOOGLE_ADS_DEVELOPER_TOKEN),
    loginCustomerEnv: env.GOOGLE_ADS_LOGIN_CUSTOMER_ID
      ? String(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID).replace(/\D/g, '')
      : null,
    checks: {},
  };

  const ver = env.GOOGLE_ADS_API_VERSION || 'v22';
  report.checks.apiVersionConfigured = ver === 'v22' ? 'PASS' : `WARN(${ver})`;

  // Probe version routing (invalid bearer — expect JSON on live version)
  const probe = await fetch(
    `https://googleads.googleapis.com/${ver}/customers:listAccessibleCustomers`,
    {
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer ya29.invalid',
        'developer-token': 'invalid',
      },
    },
  );
  const probeText = await probe.text();
  const probeIsJson = probeText.trim().startsWith('{');
  report.checks.versionRouting = {
    status: probe.status,
    isJson: probeIsJson,
    result: probeIsJson && probe.status !== 404 ? 'PASS' : 'FAIL',
  };

  let PrismaClient;
  try {
    PrismaClient = require('@prisma/client').PrismaClient;
  } catch {
    PrismaClient = require('../packages/database/node_modules/@prisma/client').PrismaClient;
  }
  const prisma = new PrismaClient();

  const conn = await prisma.adConnection.findFirst({
    where: {
      provider: 'GOOGLE',
      encryptedCredentials: { not: null },
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      organizationId: true,
      status: true,
      scopes: true,
      externalAccountId: true,
      lastError: true,
      encryptedCredentials: true,
      metadata: true,
    },
  });

  if (!conn) {
    report.checks.connection = 'FAIL(no Google connection)';
    console.log(JSON.stringify(report, null, 2));
    await prisma.$disconnect();
    process.exit(1);
  }

  report.connection = {
    orgTail: conn.organizationId.slice(-6),
    status: conn.status,
    scopes: conn.scopes,
    hasAdwordsScope: Array.isArray(conn.scopes)
      ? conn.scopes.some((s) => String(s).includes('adwords'))
      : false,
    externalAccountId: conn.externalAccountId,
    lastError: conn.lastError,
    metadata: conn.metadata,
  };

  const plain = JSON.parse(decryptSecret(conn.encryptedCredentials, env.ENCRYPTION_KEY));
  const refreshToken = plain.refreshToken || plain.refresh_token;
  if (!refreshToken) {
    report.checks.refreshToken = 'FAIL(missing)';
    console.log(JSON.stringify(report, null, 2));
    await prisma.$disconnect();
    process.exit(1);
  }
  report.checks.refreshToken = 'PASS(present)';

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const tokenJson = await tokenRes.json();
  if (!tokenJson.access_token) {
    report.checks.tokenRefresh = {
      result: 'FAIL',
      http: tokenRes.status,
      error: tokenJson.error || null,
      error_description: tokenJson.error_description || null,
    };
    console.log(JSON.stringify(report, null, 2));
    await prisma.$disconnect();
    process.exit(1);
  }
  report.checks.tokenRefresh = 'PASS';

  // Scope check via tokeninfo (do not print token)
  const infoRes = await fetch('https://oauth2.googleapis.com/tokeninfo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ access_token: tokenJson.access_token }),
  });
  const info = await infoRes.json().catch(() => ({}));
  const scopeStr = String(info.scope || info.scopes || '');
  const hasAdwords = scopeStr.includes('adwords') || scopeStr.includes('www.googleapis.com/auth/adwords');
  report.checks.oauthScope = {
    result: hasAdwords ? 'PASS' : 'FAIL',
    scopes: scopeStr || '(empty/unavailable)',
    http: infoRes.status,
    error: info.error_description || info.error || null,
  };

  // listAccessibleCustomers
  const listRes = await fetch(
    `https://googleads.googleapis.com/${ver}/customers:listAccessibleCustomers`,
    {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${tokenJson.access_token}`,
        'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN,
      },
    },
  );
  const listText = await listRes.text();
  let listBody = null;
  try {
    listBody = JSON.parse(listText);
  } catch {
    listBody = { nonJson: true, preview: listText.slice(0, 120) };
  }
  const requestId = listRes.headers.get('request-id') || listRes.headers.get('x-request-id');
  const resourceNames = listBody?.resourceNames || [];
  const adsErrors = [];
  for (const d of listBody?.error?.details || []) {
    for (const e of d.errors || []) {
      const codeVals = e.errorCode ? Object.values(e.errorCode) : [];
      adsErrors.push({ code: codeVals[0] || null, message: e.message || null, requestId: d.requestId });
    }
  }

  report.checks.listAccessibleCustomers = {
    result: listRes.ok && !listBody?.error ? 'PASS' : 'FAIL',
    http: listRes.status,
    rpcStatus: listBody?.error?.status || null,
    message: listBody?.error?.message || null,
    adsErrors,
    requestId: requestId || adsErrors[0]?.requestId || null,
    customerCount: Array.isArray(resourceNames) ? resourceNames.length : 0,
    customerIdsSample: (resourceNames || [])
      .slice(0, 5)
      .map((r) => String(r).replace(/^customers\//, '').replace(/\D/g, '')),
  };

  // If list PASS, try GAQL on first selected or first accessible
  if (report.checks.listAccessibleCustomers.result === 'PASS') {
    const linked = await prisma.adGoogleAdsAccount.findFirst({
      where: { organizationId: conn.organizationId, isSelected: true },
      select: { customerId: true, loginCustomerId: true },
    });
    const customerId =
      (linked?.customerId || report.checks.listAccessibleCustomers.customerIdsSample[0] || '').replace(
        /\D/g,
        '',
      );
    const loginCustomerId = (linked?.loginCustomerId || '').replace(/\D/g, '') || null;
    if (customerId) {
      const headers = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenJson.access_token}`,
        'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN,
      };
      if (loginCustomerId && loginCustomerId !== customerId) {
        headers['login-customer-id'] = loginCustomerId;
      }
      const gaqlRes = await fetch(
        `https://googleads.googleapis.com/${ver}/customers/${customerId}/googleAds:search`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            query:
              'SELECT customer.id, customer.descriptive_name, customer.manager FROM customer LIMIT 1',
          }),
        },
      );
      const gaqlText = await gaqlRes.text();
      let gaqlBody = null;
      try {
        gaqlBody = JSON.parse(gaqlText);
      } catch {
        gaqlBody = { nonJson: true };
      }
      const gaqlErrors = [];
      for (const d of gaqlBody?.error?.details || []) {
        for (const e of d.errors || []) {
          const codeVals = e.errorCode ? Object.values(e.errorCode) : [];
          gaqlErrors.push({ code: codeVals[0] || null, message: e.message || null });
        }
      }
      report.checks.gaqlCustomer = {
        result: gaqlRes.ok && !gaqlBody?.error ? 'PASS' : 'FAIL',
        customerId,
        loginCustomerId,
        http: gaqlRes.status,
        rpcStatus: gaqlBody?.error?.status || null,
        adsErrors: gaqlErrors,
        requestId: gaqlRes.headers.get('request-id'),
        name: gaqlBody?.results?.[0]?.customer?.descriptiveName || null,
      };
    } else {
      report.checks.gaqlCustomer = 'SKIP(no customer)';
    }
  }

  const listPass = report.checks.listAccessibleCustomers.result === 'PASS';
  const gaqlPass = report.checks.gaqlCustomer?.result === 'PASS';
  report.summary = listPass && (gaqlPass || report.checks.gaqlCustomer === 'SKIP(no customer)')
    ? listPass && gaqlPass
      ? 'GOOGLE ADS LIVE API PASS'
      : 'LIST PASS (GAQL skipped)'
    : 'GOOGLE ADS LIVE API FAIL';

  console.log(JSON.stringify(report, null, 2));
  await prisma.$disconnect();
  process.exit(listPass ? 0 : 1);
}

main().catch((e) => {
  console.error(JSON.stringify({ fatal: e.message }, null, 2));
  process.exit(1);
});
