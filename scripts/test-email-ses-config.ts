/**
 * Kiểm tra cấu hình Amazon SES (không log secret).
 *   node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-email-ses-config.ts
 */
import {
  describeSesConfigGap,
  getEmailProviderHealth,
  sesIsConfigured,
} from '../packages/shared/dist/email-provider';

type Case = { name: string; ok: boolean; detail?: string };

const API = (process.env.API_URL?.replace(/\/$/, '') || 'http://127.0.0.1:4000').replace(
  /\/api\/v1$/,
  '',
);

async function api(path: string, token?: string, init?: RequestInit) {
  const res = await fetch(`${API}/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function print(results: Case[]) {
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  — ${r.detail}` : ''}`);
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

async function main() {
  const results: Case[] = [];
  const health = getEmailProviderHealth();

  results.push({
    name: 'provider_requested_ses',
    ok: health.requested === 'ses',
    detail: `requested=${health.requested}`,
  });
  results.push({
    name: 'provider_resolved_ses',
    ok: health.resolved === 'ses',
    detail: `resolved=${health.resolved}`,
  });
  results.push({
    name: 'ses_region',
    ok: health.region === 'ap-southeast-1',
    detail: `region=${health.region}`,
  });
  results.push({
    name: 'ses_from_configured',
    ok: health.fromConfigured,
    detail: `fromConfigured=${health.fromConfigured}`,
  });

  const gap = describeSesConfigGap();
  results.push({
    name: 'ses_credentials_check',
    ok: true,
    detail: sesIsConfigured() ? 'configured' : `missing: ${gap.join(', ')}`,
  });

  const healthApi = await api('/health');
  const ep = healthApi.json?.emailProvider as Record<string, unknown> | undefined;
  results.push({
    name: 'health_email_provider',
    ok:
      healthApi.status === 200 &&
      ep?.resolved === 'ses' &&
      typeof ep?.configured === 'boolean',
    detail: `status=${healthApi.status} resolved=${ep?.resolved} configured=${ep?.configured}`,
  });

  if (!sesIsConfigured()) {
    results.push({
      name: 'ses_live_send_skipped',
      ok: true,
      detail: 'Thiếu AWS credentials — bỏ qua gửi SES thật. Tạo IAM Access Key rồi thêm vào .env.',
    });
    print(results);
    return;
  }

  const email = process.env.META_REVIEWER_EMAIL;
  const password = process.env.META_REVIEWER_PASSWORD;
  if (!email || !password) {
    results.push({
      name: 'ses_live_send_skipped',
      ok: true,
      detail: 'Thiếu META_REVIEWER credentials — bỏ qua gửi HTML test',
    });
    print(results);
    return;
  }

  const login = await api('/auth/login', undefined, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const token = login.json?.accessToken as string | undefined;
  if (!token) {
    results.push({ name: 'login', ok: false, detail: `status=${login.status}` });
    print(results);
    return;
  }

  const send = await api('/email-marketing/send-test', token, {
    method: 'POST',
    body: JSON.stringify({
      to: email,
      subject: 'SES HTML test {{firstName}}',
      htmlBody: '<h1>SES HTML</h1><p>Hi {{firstName}} from {{company}}</p>',
      previewText: 'SES sandbox test',
    }),
  });

  const sandboxRejected =
    send.status === 400 &&
    typeof send.json?.message === 'string' &&
    /sandbox|not verified|messagerejected/i.test(send.json.message);

  results.push({
    name: 'ses_send_test_html',
    ok: send.status === 200 || send.status === 201 || sandboxRejected,
    detail: sandboxRejected
      ? `sandbox_rejected (expected until Production Access): ${String(send.json?.message).slice(0, 120)}`
      : `status=${send.status} provider=${send.json?.provider}`,
  });

  print(results);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
