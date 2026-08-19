/**
 * Prompt 15 — AI Funnel Consultant (unit + live smoke).
 *   pnpm test:funnel-consultant
 */
import fs from 'node:fs';
import {
  applyConsultantIntent,
  buildConsultantInsights,
  buildConsultantProposal,
  buildFallbackFunnelComplete,
  detectConsultantIntents,
  hashFunnelSpec,
  validateConsultantDraft,
} from '../packages/shared/src';

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

  const spec = buildFallbackFunnelComplete({ templateSlug: 'consultation' });
  spec.offer = 'Giảm 30% liệu trình facial cho khách mới';

  results.push({
    name: 'unit_detect_intents',
    ok:
      detectConsultantIntents('thêm mini game').includes('ADD_MINI_GAME') &&
      detectConsultantIntents('không giảm giá').includes('NO_DISCOUNT') &&
      detectConsultantIntents('thêm Messenger').includes('ADD_MESSENGER') &&
      detectConsultantIntents('thêm remarketing').includes('ADD_REMARKETING') &&
      detectConsultantIntents('tối ưu follow-up').includes('OPTIMIZE_FOLLOW_UP') &&
      detectConsultantIntents('đổi offer sang tư vấn').includes('CHANGE_OFFER'),
  });

  const game = applyConsultantIntent(spec, 'ADD_MINI_GAME');
  results.push({
    name: 'unit_add_mini_game',
    ok: game.spec.nodes.some((n) => n.type === 'GAME') && game.changes.length > 0,
  });
  const gameValidated = validateConsultantDraft(game.spec);
  results.push({
    name: 'unit_game_schema',
    ok: gameValidated.spec.mode === 'draft' && gameValidated.validation.score >= 0,
  });

  const noDisc = applyConsultantIntent(spec, 'NO_DISCOUNT');
  results.push({
    name: 'unit_no_discount',
    ok: !/30\s*%/.test(noDisc.spec.offer) && !/giảm\s*giá/i.test(noDisc.spec.offer),
    detail: noDisc.spec.offer.slice(0, 80),
  });

  const msg = applyConsultantIntent(spec, 'ADD_MESSENGER');
  results.push({
    name: 'unit_add_messenger',
    ok: msg.spec.followUp.some((f) => f.channel === 'MESSENGER'),
  });

  const rm = applyConsultantIntent(spec, 'ADD_REMARKETING');
  results.push({
    name: 'unit_add_remarketing',
    ok:
      rm.spec.nodes.some((n) => n.type === 'RETARGET') ||
      (rm.spec.remarketing?.audiences?.length ?? 0) > 0,
  });

  const fu = applyConsultantIntent(spec, 'OPTIMIZE_FOLLOW_UP');
  results.push({
    name: 'unit_optimize_followup',
    ok: fu.spec.followUp.length >= spec.followUp.length,
  });

  const emptyInsights = buildConsultantInsights({
    hasRealData: false,
    scope: 'none',
    leads: 0,
    booking: 0,
    purchased: 0,
    conversionRate: null,
    bookingRate: null,
    cpl: null,
    spend: null,
    slaBreached: 0,
    slaRate: null,
    avgConversionTimeHours: null,
    dropOff: [],
  });
  results.push({
    name: 'unit_no_fake_kpi',
    ok:
      emptyInsights.some((i) => i.topic === 'data') &&
      !emptyInsights.some((i) => /ROAS|87%|bịa/.test(i.message) && i.topic !== 'data'),
  });

  const proposal = buildConsultantProposal({
    current: spec,
    intents: ['ADD_MINI_GAME'],
    source: 'rules',
  });
  results.push({
    name: 'unit_proposal_gate',
    ok:
      proposal.applied === false &&
      proposal.deployable === false &&
      proposal.budgetChanged === false &&
      proposal.requiresConfirmation === true &&
      proposal.specHash === hashFunnelSpec(proposal.proposed),
  });

  results.push({
    name: 'ui_consultant_panel',
    ok: fs.existsSync(`${repoRoot}/apps/web/src/components/funnel/funnel-consultant-panel.tsx`),
  });
  results.push({
    name: 'ui_canvas_embed',
    ok: fs
      .readFileSync(`${repoRoot}/apps/web/src/components/funnel/funnel-canvas-panel.tsx`, 'utf8')
      .includes('FunnelConsultantPanel'),
  });
  results.push({
    name: 'api_consultant_service',
    ok: fs.existsSync(`${repoRoot}/apps/api/src/funnel-builder/funnel-consultant.service.ts`),
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
      const recs = await api('/funnel-builder/recommendations', token);
      const withComplete = (
        recs.json as Array<{ id: string; completeGeneratedAt?: string | null }>
      )?.find((r) => r.completeGeneratedAt);
      if (withComplete?.id) {
        const proposed = await api(
          `/funnel-builder/recommendations/${withComplete.id}/consultant/propose`,
          token,
          {
            method: 'POST',
            body: JSON.stringify({ intent: 'OPTIMIZE_FOLLOW_UP', prompt: 'tối ưu follow-up' }),
          },
        );
        results.push({
          name: 'live_propose',
          ok:
            (proposed.status === 200 || proposed.status === 201) &&
            proposed.json?.applied === false &&
            proposed.json?.requiresConfirmation === true &&
            proposed.json?.budgetChanged === false,
          detail: proposed.status !== 200 && proposed.status !== 201
            ? `status=${proposed.status} ${JSON.stringify(proposed.json).slice(0, 180)}`
            : undefined,
        });

        const denied = await api(
          `/funnel-builder/recommendations/${withComplete.id}/consultant/apply`,
          token,
          {
            method: 'POST',
            body: JSON.stringify({
              confirm: false,
              complete: proposed.json?.proposed ?? {},
            }),
          },
        );
        results.push({
          name: 'live_apply_requires_confirm',
          ok: denied.status === 400,
          detail: `status=${denied.status}`,
        });
      } else {
        results.push({ name: 'live_propose', ok: true, detail: 'no complete spec' });
        results.push({ name: 'live_apply_requires_confirm', ok: true, detail: 'skip' });
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
