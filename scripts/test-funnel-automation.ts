/**
 * Prompt 9 — Funnel × Automation (unit + UI + live smoke).
 *   node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-funnel-automation.ts
 */
import {
  automationFlowMatchesFunnel,
  isSafeWebhookUrl,
  normalizeAutomationAction,
  stageTriggerMatches,
  FUNNEL_AUTOMATION_TRIGGERS,
} from '../packages/shared/src/funnel-automation';
import { AUTOMATION_TRIGGER_CODES } from '../packages/shared/src/funnel-blueprint';
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

  results.push({
    name: 'unit_funnel_match_same',
    ok: automationFlowMatchesFunnel('funnel-a', 'funnel-a'),
  });
  results.push({
    name: 'unit_funnel_mismatch',
    ok: !automationFlowMatchesFunnel('funnel-a', 'funnel-b'),
  });
  results.push({
    name: 'unit_legacy_null_funnel_runs_org_wide',
    ok: automationFlowMatchesFunnel(null, 'funnel-a') && automationFlowMatchesFunnel(null, null),
  });
  results.push({
    name: 'unit_funnel_flow_skips_lead_without_funnel',
    ok: !automationFlowMatchesFunnel('funnel-a', null),
  });

  const wait = normalizeAutomationAction({ type: 'WAIT', minutes: 15 });
  results.push({
    name: 'unit_normalize_wait',
    ok: wait.type === 'WAIT' && wait.type === 'WAIT' && (wait as { minutes: number }).minutes === 15,
  });
  const sale = normalizeAutomationAction({ type: 'ASSIGN_SALE', employeeId: undefined });
  results.push({ name: 'unit_alias_assign_sale', ok: sale.type === 'ASSIGN_EMPLOYEE' });
  const stage = normalizeAutomationAction({ type: 'CHANGE_STAGE', stageId: 'x' });
  results.push({ name: 'unit_alias_change_stage', ok: stage.type === 'CHANGE_STATUS' });
  const hook = normalizeAutomationAction({ type: 'WEBHOOK', url: 'https://example.com/hook' });
  results.push({ name: 'unit_normalize_webhook', ok: hook.type === 'WEBHOOK' });

  results.push({
    name: 'unit_webhook_url_blocks_localhost',
    ok: !isSafeWebhookUrl('http://127.0.0.1/hook') && isSafeWebhookUrl('https://example.com/h'),
  });
  results.push({
    name: 'unit_stage_trigger_empty_config_matches',
    ok: stageTriggerMatches({}, { stageId: 's1', stageCode: 'CONTACTED' }),
  });
  results.push({
    name: 'unit_stage_trigger_filters_other_stage',
    ok: !stageTriggerMatches({ stageId: 's1' }, { stageId: 's2', stageCode: 'BOOKED' }),
  });

  for (const t of FUNNEL_AUTOMATION_TRIGGERS) {
    results.push({
      name: `unit_trigger_in_blueprint_${t}`,
      ok: (AUTOMATION_TRIGGER_CODES as readonly string[]).includes(t),
    });
  }

  const schema = fs.readFileSync(
    new URL('../packages/database/prisma/schema.prisma', import.meta.url),
    'utf8',
  );
  results.push({
    name: 'schema_funnel_id_on_flow',
    ok: schema.includes('funnelId') && schema.includes('STAGE_CHANGED') && schema.includes('PURCHASED'),
  });

  const panel = fs.readFileSync(
    new URL('../apps/web/src/components/automation/flow-form-dialog.tsx', import.meta.url),
    'utf8',
  );
  results.push({
    name: 'ui_flow_form_has_funnel_picker',
    ok: panel.includes('Funnel') && panel.includes('funnelId'),
  });

  const email = (process.env.META_REVIEWER_EMAIL ?? '').trim();
  const password = (process.env.META_REVIEWER_PASSWORD ?? '').trim();
  if (!email || !password) {
    console.log('SKIP live (no META_REVIEWER_EMAIL/PASSWORD)');
  } else {
    const login = await api('/auth/login', undefined, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    const token = (login.json as { accessToken?: string }).accessToken;
    results.push({
      name: 'live_login',
      ok: (login.status === 200 || login.status === 201) && Boolean(token),
      detail: `status=${login.status}`,
    });
    if (token) {
      const funnels = await api('/automation/funnels', token);
      results.push({
        name: 'live_list_funnels',
        ok: funnels.status === 200 && Array.isArray(funnels.json),
        detail: `status=${funnels.status} count=${Array.isArray(funnels.json) ? funnels.json.length : '-'}`,
      });
      const flows = await api('/automation/flows', token);
      results.push({
        name: 'live_list_flows_tenant',
        ok: flows.status === 200 && Array.isArray(flows.json),
        detail: `status=${flows.status}`,
      });
      const cross = await api('/automation/funnels');
      results.push({
        name: 'live_funnels_requires_auth',
        ok: cross.status === 401 || cross.status === 403,
      });
    }
  }

  let failed = 0;
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
    if (!r.ok) failed += 1;
  }
  if (failed) {
    console.log(`FAIL ${failed}/${results.length}`);
    process.exit(1);
  }
  console.log(`ALL_PASS ${results.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
