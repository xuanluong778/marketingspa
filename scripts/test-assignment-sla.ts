/**
 * Prompt 11 — Assignment + SLA (unit + UI + live smoke).
 */
import {
  assignmentRuleMatches,
  assignmentRuleSpecificity,
  pickBestAssignmentRule,
  LEAD_ASSIGNMENT_MODES,
} from '../packages/shared/src/funnel-assignment';
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
    name: 'unit_modes_include_least_loaded',
    ok: LEAD_ASSIGNMENT_MODES.includes('LEAST_LOADED') && LEAD_ASSIGNMENT_MODES.includes('BY_SCORE'),
  });

  const rules = [
    { id: 'org', priority: 0, isActive: true },
    { id: 'branch', branchId: 'b1', priority: 0, isActive: true },
    { id: 'source', leadSourceId: 's1', priority: 0, isActive: true },
    { id: 'campaign', adCampaignId: 'c1', priority: 0, isActive: true },
    { id: 'score', minScore: 70, maxScore: 100, priority: 5, isActive: true },
  ];

  results.push({
    name: 'unit_match_score_band',
    ok:
      assignmentRuleMatches(rules[4]!, { score: 80 }) &&
      !assignmentRuleMatches(rules[4]!, { score: 40 }),
  });
  results.push({
    name: 'unit_match_branch',
    ok:
      assignmentRuleMatches(rules[1]!, { branchId: 'b1' }) &&
      !assignmentRuleMatches(rules[1]!, { branchId: 'b2' }),
  });

  const best = pickBestAssignmentRule(rules, {
    branchId: 'b1',
    leadSourceId: 's1',
    adCampaignId: 'c1',
    score: 90,
  });
  results.push({
    name: 'unit_pick_most_specific',
    ok: best?.id === 'campaign' || (best?.id === 'score' && (best.priority ?? 0) >= 5),
    detail: `picked=${best?.id} spec=${best ? assignmentRuleSpecificity(best) : '-'}`,
  });

  // campaign (400) vs score priority*1000+50 = 5050 → score wins
  results.push({
    name: 'unit_priority_beats_specificity',
    ok: best?.id === 'score',
    detail: `picked=${best?.id}`,
  });

  const schema = fs.readFileSync(
    new URL('../packages/database/prisma/schema.prisma', import.meta.url),
    'utf8',
  );
  results.push({
    name: 'schema_assignment_fields',
    ok:
      schema.includes('LEAST_LOADED') &&
      schema.includes('reassignOnSla') &&
      schema.includes('notifyManager') &&
      schema.includes('leadSourceId') &&
      schema.includes('adCampaignId'),
  });

  const panel = fs.readFileSync(
    new URL('../apps/web/src/components/settings/settings-assignment-panel.tsx', import.meta.url),
    'utf8',
  );
  results.push({
    name: 'ui_assignment_panel',
    ok:
      panel.includes('Round Robin') &&
      panel.includes('Least Loaded') &&
      panel.includes('Reassign khi quá SLA') &&
      panel.includes('SLA theo FunnelStage'),
  });

  const worker = fs.readFileSync(
    new URL('../apps/worker/src/lib/sla-breach-scan.ts', import.meta.url),
    'utf8',
  );
  results.push({
    name: 'worker_sla_scan',
    ok: worker.includes('SLA_BREACHED') && worker.includes('LEAD_SLA_BREACHED') && worker.includes('reassignOnSla'),
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
      const list = await api('/crm/assignment-rules', token);
      results.push({
        name: 'live_list_rules',
        ok: list.status === 200 && Array.isArray(list.json),
        detail: `status=${list.status}`,
      });
      const pipeline = await api('/crm/pipeline', token);
      results.push({
        name: 'live_pipeline_stages_sla',
        ok: pipeline.status === 200,
        detail: `status=${pipeline.status}`,
      });
      const unauth = await api('/crm/assignment-rules');
      results.push({
        name: 'live_rules_requires_auth',
        ok: unauth.status === 401 || unauth.status === 403,
        detail: `status=${unauth.status}`,
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
