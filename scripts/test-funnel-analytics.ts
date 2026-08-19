/**
 * Prompt 12 — Funnel Analytics + Attribution (unit + live smoke).
 *   node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-funnel-analytics.ts
 */
import {
  avgHoursBetween,
  dropOffFromPrevious,
  FUNNEL_SAAS_STAGES,
  pctRate,
  resolveAttributionTouch,
} from '../packages/shared/src/funnel-analytics';
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

  results.push({ name: 'unit_pct_rate', ok: pctRate(25, 100) === 25 && pctRate(1, 0) === null });
  results.push({
    name: 'unit_drop_off',
    ok: dropOffFromPrevious(60, 100) === 40 && dropOffFromPrevious(100, 0) === null,
  });
  results.push({
    name: 'unit_avg_hours',
    ok: avgHoursBetween([3600000, 7200000]) === 1.5,
  });
  results.push({
    name: 'unit_saas_stages',
    ok: FUNNEL_SAAS_STAGES.length === 5 && FUNNEL_SAAS_STAGES[0]?.key === 'LEAD',
  });

  const touch = resolveAttributionTouch(
    {
      utmSource: 'last-src',
      firstTouchJson: { utmSource: 'first-src', capturedAt: '2026-01-01' },
      lastTouchJson: { utmSource: 'last-json', capturedAt: '2026-01-02' },
    },
    'first',
  );
  results.push({ name: 'unit_first_touch', ok: touch.utmSource === 'first-src' });

  const touchLast = resolveAttributionTouch(
    {
      utmSource: 'row-src',
      lastTouchJson: { utmSource: 'last-json' },
    },
    'last',
  );
  results.push({ name: 'unit_last_touch_json', ok: touchLast.utmSource === 'last-json' });

  const repoRoot = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

  const uiHasDashboard = fs.existsSync(
    `${repoRoot}/apps/web/src/components/funnel/funnel-analytics-dashboard.tsx`,
  );
  results.push({ name: 'ui_dashboard_component', ok: uiHasDashboard });

  const uiHasHook = fs
    .readFileSync(`${repoRoot}/apps/web/src/hooks/use-funnel.ts`, 'utf8')
    .includes('useFunnelAnalytics');
  results.push({ name: 'ui_hook_analytics', ok: uiHasHook });

  const apiHasService = fs.existsSync(`${repoRoot}/apps/api/src/leads/funnel-analytics.service.ts`);
  results.push({ name: 'api_service', ok: apiHasService });

  const email = process.env.META_REVIEWER_EMAIL;
  const password = process.env.META_REVIEWER_PASSWORD;
  if (email && password) {
    const login = await api('/auth/login', undefined, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    const token = login.json?.accessToken as string | undefined;
    if (token) {
      const dash = await api('/leads/funnel/analytics?from=2020-01-01&to=2030-12-31', token);
      results.push({
        name: 'live_funnel_analytics',
        ok: dash.status === 200 && dash.json?.kpis && Array.isArray(dash.json?.funnelStages),
        detail: dash.status !== 200 ? JSON.stringify(dash.json).slice(0, 200) : undefined,
      });
      results.push({
        name: 'live_funnel_stages_click_filter',
        ok:
          dash.status === 200 &&
          dash.json?.funnelStages?.every(
            (s: { leadFilter?: Record<string, string> }) =>
              s.leadFilter && typeof s.leadFilter.createdFrom === 'string',
          ),
      });
      results.push({
        name: 'live_touch_model',
        ok: (await api('/leads/funnel/analytics?touchModel=first', token)).json?.touchModel ===
          'first',
      });
      const statsLegacy = await api('/leads/funnel/stats', token);
      results.push({ name: 'live_legacy_stats', ok: statsLegacy.status === 200 });
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
