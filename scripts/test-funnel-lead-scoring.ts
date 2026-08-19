/**
 * Prompt 10 — Lead Scoring + MQL/SQL (unit + UI + live smoke).
 *   node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-funnel-lead-scoring.ts
 */
import {
  applyScoreDelta,
  clampLeadScore,
  detectAskPrice,
  FUNNEL_SCORING_EVENTS,
  proposeScoringForFunnel,
  qualificationAfterScore,
  scoreTriggerMatches,
  shouldAdvancePipeline,
} from '../packages/shared/src/funnel-scoring';
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
    name: 'unit_clamp_0_100',
    ok: clampLeadScore(-4) === 0 && clampLeadScore(140) === 100 && clampLeadScore(70) === 70,
  });

  const delta = applyScoreDelta(40, 25, 100);
  results.push({
    name: 'unit_apply_delta',
    ok: delta.previous === 40 && delta.next === 65 && delta.delta === 25,
  });
  results.push({
    name: 'unit_apply_delta_clamps',
    ok: applyScoreDelta(90, 30, 100).next === 100,
  });

  const q = qualificationAfterScore(40, 55, 50, 80, null);
  results.push({ name: 'unit_cross_mql', ok: q.crossedMql && q.crossed === 'MQL' && !q.crossedSql });
  const q2 = qualificationAfterScore(55, 85, 50, 80, 'MQL');
  results.push({ name: 'unit_cross_sql', ok: q2.crossedSql && q2.crossed === 'SQL' && !q2.crossedMql });
  const q3 = qualificationAfterScore(85, 90, 50, 80, 'SQL');
  results.push({ name: 'unit_no_recross', ok: !q3.crossedMql && !q3.crossedSql });

  results.push({
    name: 'unit_detect_ask_price',
    ok: detectAskPrice('Cho mình hỏi giá liệu trình ạ') && !detectAskPrice('Xin chào spa'),
  });

  results.push({
    name: 'unit_score_trigger_empty_matches',
    ok: scoreTriggerMatches({}, { score: 10 }),
  });
  results.push({
    name: 'unit_score_trigger_min',
    ok: !scoreTriggerMatches({ minScore: 70 }, { score: 40 }) &&
      scoreTriggerMatches({ minScore: 70 }, { score: 80 }),
  });
  results.push({
    name: 'unit_advance_pipeline',
    ok: shouldAdvancePipeline('NEW', 'QUALIFIED') && !shouldAdvancePipeline('BOOKED', 'QUALIFIED'),
  });

  const proposal = proposeScoringForFunnel({
    selectedSlug: 'booking-spa',
    prompt: 'Thu lead đặt lịch spa',
  });
  const events = new Set(proposal.rules.map((r) => r.eventType));
  results.push({
    name: 'unit_propose_has_7_events',
    ok: FUNNEL_SCORING_EVENTS.every((e) => events.has(e)) && proposal.mqlThreshold < proposal.sqlThreshold,
  });

  const schema = fs.readFileSync(
    new URL('../packages/database/prisma/schema.prisma', import.meta.url),
    'utf8',
  );
  results.push({
    name: 'schema_scoring_models',
    ok:
      schema.includes('model FunnelScoringConfig') &&
      schema.includes('mqlThreshold') &&
      schema.includes('sqlThreshold') &&
      schema.includes('qualification'),
  });

  const panel = fs.readFileSync(
    new URL('../apps/web/src/components/funnel/funnel-scoring-panel.tsx', import.meta.url),
    'utf8',
  );
  results.push({
    name: 'ui_scoring_panel',
    ok: panel.includes('MQL threshold') && panel.includes('SQL threshold') && panel.includes('AI đề xuất'),
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
      const recs = await api('/funnel-builder/recommendations', token);
      const list = Array.isArray(recs.json) ? recs.json : [];
      results.push({
        name: 'live_list_funnels',
        ok: recs.status === 200 && Array.isArray(recs.json),
        detail: `status=${recs.status} count=${list.length}`,
      });
      const funnelId = (list[0] as { id?: string } | undefined)?.id;
      if (funnelId) {
        const got = await api(`/funnel-builder/recommendations/${funnelId}/scoring`, token);
        results.push({
          name: 'live_get_scoring',
          ok: got.status === 200,
          detail: `status=${got.status}`,
        });
        const proposed = await api(
          `/funnel-builder/recommendations/${funnelId}/scoring/propose`,
          token,
          { method: 'POST' },
        );
        const body = proposed.json as { rules?: unknown[]; mqlThreshold?: number };
        results.push({
          name: 'live_propose_scoring',
          ok: proposed.status === 200 && Array.isArray(body.rules) && (body.rules?.length ?? 0) >= 7,
          detail: `status=${proposed.status} rules=${body.rules?.length ?? 0}`,
        });
      } else {
        results.push({ name: 'live_get_scoring', ok: true, detail: 'skip no funnel' });
        results.push({ name: 'live_propose_scoring', ok: true, detail: 'skip no funnel' });
      }
      const unauth = await api('/funnel-builder/recommendations/x/scoring');
      results.push({
        name: 'live_scoring_requires_auth',
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
