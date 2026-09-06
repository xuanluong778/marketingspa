/**
 * Lead dashboard source-of-truth sync (no mocked PASS).
 *   node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-funnel-lead-dashboard.ts
 */
type Case = { name: string; ok: boolean; detail?: string };

const API = (process.env.API_URL?.replace(/\/$/, '') || 'http://127.0.0.1:4000').replace(
  /\/api\/v1$/,
  '',
);
const FUNNEL_ID = process.env.FUNNEL_CAPTURE_ID || 'acb12e5e-57de-4513-9c34-885ecc682e80';

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

function okStatus(s: number) {
  return s === 200 || s === 201;
}

async function main() {
  const results: Case[] = [];
  const email = process.env.META_REVIEWER_EMAIL;
  const password = process.env.META_REVIEWER_PASSWORD;
  if (!email || !password) {
    results.push({ name: 'live_skip', ok: false, detail: 'missing META_REVIEWER credentials' });
    print(results);
    process.exit(1);
  }

  const login = await api('/auth/login', undefined, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const token = login.json?.accessToken as string | undefined;
  results.push({ name: 'login', ok: okStatus(login.status) && !!token, detail: `status=${login.status}` });
  if (!token) {
    print(results);
    process.exit(1);
  }

  const me = await api('/auth/me', token);
  const orgId = me.json?.organizationId as string | undefined;
  results.push({ name: 'tenant_org', ok: !!orgId, detail: orgId });

  const journeyList = await api(`/funnel-builder/recommendations/${FUNNEL_ID}/journey`, token);
  const listed = (journeyList.json?.leads as Array<{ leadId: string; leadName: string }> | undefined) ?? [];
  const leadId = listed[0]?.leadId as string | undefined;
  results.push({
    name: 'funnel_customer_list',
    ok: okStatus(journeyList.status) && !!leadId,
    detail: `count=${listed.length} leadId=${leadId ?? ''}`,
  });
  if (!leadId) {
    print(results);
    process.exit(1);
  }

  const crm = await api(`/leads/${leadId}`, token);
  const journey = await api(`/leads/${leadId}/journey`, token);
  results.push({
    name: 'same_source_name_phone',
    ok:
      okStatus(crm.status) &&
      okStatus(journey.status) &&
      crm.json?.id === leadId &&
      crm.json?.organizationId === orgId &&
      journey.json?.leadId === leadId &&
      journey.json?.organizationId === orgId &&
      crm.json?.name === journey.json?.leadName &&
      String(crm.json?.phone ?? '') === String(journey.json?.phone ?? ''),
    detail: JSON.stringify({
      crmName: crm.json?.name,
      journeyName: journey.json?.leadName,
      crmPhone: crm.json?.phone,
      journeyPhone: journey.json?.phone,
      org: crm.json?.organizationId,
      funnel: crm.json?.funnelRecommendationId,
    }),
  });

  results.push({
    name: 'lead_has_funnel_and_attribution_shape',
    ok:
      typeof crm.json?.funnelRecommendationId === 'string' &&
      (crm.json.attribution == null || typeof crm.json.attribution === 'object') &&
      Array.isArray(crm.json?.appointments) &&
      Array.isArray(crm.json?.orders),
    detail: JSON.stringify({
      funnelRecommendationId: crm.json?.funnelRecommendationId,
      hasAttribution: !!crm.json?.attribution,
      appointments: crm.json?.appointments?.length ?? 0,
      orders: crm.json?.orders?.length ?? 0,
    }),
  });

  const marker = `UX ${Date.now().toString().slice(-6)}`;
  const patched = await api(`/leads/${leadId}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ name: marker }),
  });
  results.push({
    name: 'patch_lead',
    ok: okStatus(patched.status) && patched.json?.name === marker,
    detail: `status=${patched.status} name=${patched.json?.name}`,
  });

  const crm2 = await api(`/leads/${leadId}`, token);
  const journey2 = await api(`/leads/${leadId}/journey`, token);
  const list2 = await api(`/funnel-builder/recommendations/${FUNNEL_ID}/journey`, token);
  const listed2 = (list2.json?.leads as Array<{ leadId: string; leadName: string }> | undefined) ?? [];
  results.push({
    name: 'sync_after_patch_crm_journey_funnel',
    ok:
      crm2.json?.name === marker &&
      journey2.json?.leadName === marker &&
      listed2.some((l) => l.leadId === leadId && l.leadName === marker),
    detail: JSON.stringify({
      crm: crm2.json?.name,
      journey: journey2.json?.leadName,
      list: listed2.find((l) => l.leadId === leadId)?.leadName,
    }),
  });

  await api(`/leads/${leadId}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ name: crm.json?.name }),
  });

  print(results);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}

function print(results: Case[]) {
  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  — ${r.detail}` : ''}`);
  }
  console.log(`\n${failed.length ? 'FAIL' : 'PASS'}  ${results.length - failed.length}/${results.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
