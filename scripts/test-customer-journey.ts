/**
 * Prompt 13 — Customer Journey Timeline (unit + live smoke).
 *   node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-customer-journey.ts
 */
import {
  activityActionToJourneyKind,
  funnelEventTypeToJourneyKind,
  mergeCustomerJourneyTimeline,
  CUSTOMER_JOURNEY_STEPS,
} from '../packages/shared/src/customer-journey';
import fs from 'node:fs';

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

async function main() {
  const results: Case[] = [];
  const repoRoot = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

  results.push({
    name: 'unit_journey_steps',
    ok: CUSTOMER_JOURNEY_STEPS.length === 9 && CUSTOMER_JOURNEY_STEPS[0]?.kind === 'AD_CLICK',
  });
  results.push({
    name: 'unit_funnel_event_map',
    ok: funnelEventTypeToJourneyKind('LEAD_CREATED') === 'LEAD' &&
      funnelEventTypeToJourneyKind('AD_CLICK') === 'AD_CLICK',
  });
  results.push({
    name: 'unit_activity_map',
    ok: activityActionToJourneyKind('FORM_SUBMITTED') === 'FORM_SUBMIT' &&
      activityActionToJourneyKind('STATUS_CHANGED') === 'STAGE_CHANGE',
  });

  const merged = mergeCustomerJourneyTimeline([
    {
      id: '1',
      kind: 'LEAD',
      label: 'Lead',
      title: 'Lead',
      occurredAt: '2026-01-02T00:00:00.000Z',
      organizationId: 'o1',
      funnelId: 'f1',
      leadId: 'l1',
      source: 'activity',
      dedupeKey: 'LEAD:activity:LEAD:l1',
    },
    {
      id: '2',
      kind: 'LEAD',
      label: 'Lead',
      title: 'Lead event',
      occurredAt: '2026-01-01T00:00:00.000Z',
      organizationId: 'o1',
      funnelId: 'f1',
      leadId: 'l1',
      source: 'funnel_event',
      dedupeKey: 'LEAD:funnel_event:LEAD_CREATED:l1',
    },
  ]);
  results.push({
    name: 'unit_dedupe_prefers_funnel_event',
    ok: merged.length === 1 && merged[0]?.source === 'funnel_event',
  });

  results.push({
    name: 'schema_funnel_id',
    ok: fs.readFileSync(`${repoRoot}/packages/database/prisma/schema.prisma`, 'utf8').includes(
      'funnelId       String?                  @map("funnel_id")',
    ),
  });
  results.push({
    name: 'api_service',
    ok: fs.existsSync(`${repoRoot}/apps/api/src/crm/customer-journey.service.ts`),
  });
  results.push({
    name: 'ui_timeline',
    ok: fs.existsSync(`${repoRoot}/apps/web/src/components/funnel/customer-journey-timeline.tsx`),
  });

  const email = process.env.META_REVIEWER_EMAIL;
  const password = process.env.META_REVIEWER_PASSWORD;
  if (email && password) {
    const login = await api('/auth/login', undefined, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    const token = login.json?.accessToken as string | undefined;
    if (token) {
      const leads = await api('/leads?page=1&pageSize=1', token);
      const leadId = leads.json?.items?.[0]?.id as string | undefined;
      if (leadId) {
        const journey = await api(`/leads/${leadId}/journey`, token);
        results.push({
          name: 'live_lead_journey',
          ok: journey.status === 200 && Array.isArray(journey.json?.timeline),
          detail: journey.status !== 200 ? JSON.stringify(journey.json).slice(0, 120) : undefined,
        });
        results.push({
          name: 'live_journey_has_org',
          ok: journey.status === 200 && journey.json?.organizationId,
        });
        if (journey.json?.funnelId) {
          const fj = await api(
            `/funnel-builder/recommendations/${journey.json.funnelId}/journey?leadId=${leadId}`,
            token,
          );
          results.push({ name: 'live_funnel_journey', ok: fj.status === 200 && fj.json?.timeline });
        } else {
          results.push({ name: 'live_funnel_journey', ok: true, detail: 'no funnel on lead' });
        }
      } else {
        results.push({ name: 'live_skip', ok: true, detail: 'no leads' });
      }
    } else {
      results.push({ name: 'live_skip', ok: false, detail: 'login failed' });
    }
  } else {
    results.push({ name: 'live_skip', ok: true, detail: 'no credentials' });
  }

  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
