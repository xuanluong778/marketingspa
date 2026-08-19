/**
 * Canvas → live workflow (FORM/AUTOMATION/STAGE/BOOKING/GOAL/RETARGET).
 *   pnpm test:funnel-canvas-runtime
 */
import fs from 'node:fs';
import { buildFallbackFunnelComplete, parseFunnelCompleteSpec } from '../packages/shared/src/funnel-complete';
import { createFunnelCanvasNode } from '../packages/shared/src/funnel-canvas';
import {
  canvasRuntimeIdempotencyKey,
  conversionForCanvasEvent,
  entryCanvasNodeIds,
  evaluateFunnelEdgeCondition,
  expectedStageForCanvasEvent,
  readCanvasNodeMeta,
  selectCanvasTransitions,
} from '../packages/shared/src/funnel-canvas-runtime';
import { FUNNEL_NODE_TYPES } from '../packages/shared/src/funnel-templates';
import { prisma } from '@marketingspa/database';

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

function okStatus(s: number) {
  return s === 200 || s === 201;
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function ensureBranch(token: string) {
  const branches = await api('/organizations/branches', token);
  let branchId =
    (Array.isArray(branches.json) ? branches.json[0]?.id : null) ||
    branches.json?.items?.[0]?.id ||
    branches.json?.[0]?.id;
  if (!branchId) {
    const created = await api('/organizations/branches', token, {
      method: 'POST',
      body: JSON.stringify({ name: 'Chi nhánh canvas', code: `CV${Date.now().toString().slice(-6)}` }),
    });
    branchId = created.json?.id;
  }
  return branchId as string | undefined;
}

function finish(results: Case[]) {
  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  ${r.detail}` : ''}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

async function main() {
  const results: Case[] = [];
  const repoRoot = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

  const voucher = buildFallbackFunnelComplete({ templateSlug: 'voucher' });
  const formId = voucher.nodes.find((n) => n.type === 'FORM')?.id;
  const newStage = voucher.nodes.find((n) => n.type === 'STAGE' && n.stage?.code === 'NEW');
  const booked = voucher.nodes.find((n) => n.type === 'STAGE' && n.stage?.code === 'BOOKED');
  const contacted = voucher.nodes.find((n) => n.type === 'STAGE' && n.stage?.code === 'CONTACTED');
  const goal = voucher.nodes.find((n) => n.type === 'GOAL');

  results.push({
    name: 'unit_parse_edge_fields',
    ok: (() => {
      const parsed = parseFunnelCompleteSpec({
        ...voucher,
        connections: voucher.connections.map((c, i) =>
          i === 0
            ? {
                ...c,
                event: 'FORM_SUBMITTED',
                delayMinutes: 0,
                timeoutMinutes: 1440,
                branch: 'success',
                condition: { field: 'score', op: 'gte', value: 0 },
              }
            : c,
        ),
      });
      const c0 = parsed.connections[0];
      return (
        c0?.event === 'FORM_SUBMITTED' &&
        c0.branch === 'success' &&
        c0.timeoutMinutes === 1440 &&
        c0.condition?.op === 'gte'
      );
    })(),
  });

  const formCtx = { event: 'FORM_SUBMITTED' };
  const formEntries = entryCanvasNodeIds(voucher, formCtx);
  results.push({
    name: 'unit_form_entry_is_form',
    ok: !!formId && formEntries.includes(formId),
    detail: formEntries.join(','),
  });

  const afterForm = formId
    ? selectCanvasTransitions(voucher, formId, formCtx)
    : [];
  const afterFormNow = afterForm.filter((t) => t.kind === 'now').map((t) => t.toNodeId);
  results.push({
    name: 'unit_form_does_not_jump_contacted_booked',
    ok:
      !!formId &&
      !afterFormNow.includes(contacted?.id ?? 'n/a') &&
      !afterFormNow.includes(booked?.id ?? 'n/a'),
    detail: afterFormNow.join(',') || '(none)',
  });

  const bookCtx = { event: 'BOOKING_CREATED', stageCode: 'BOOKED' };
  results.push({
    name: 'unit_booking_maps_booked_stage',
    ok: expectedStageForCanvasEvent(bookCtx) === 'BOOKED' && conversionForCanvasEvent(bookCtx) === 'BOOKING',
  });
  const bookingEntries = entryCanvasNodeIds(voucher, bookCtx);
  results.push({
    name: 'unit_booking_enters_booked_not_new',
    ok:
      !!booked &&
      bookingEntries.includes(booked.id) &&
      !bookingEntries.includes(newStage?.id ?? ''),
    detail: bookingEntries.join(','),
  });

  const purchaseCtx = { event: 'PURCHASE' };
  const purchaseEntries = entryCanvasNodeIds(voucher, purchaseCtx);
  results.push({
    name: 'unit_purchase_hits_goal',
    ok: !!goal && purchaseEntries.includes(goal.id),
    detail: purchaseEntries.join(','),
  });

  results.push({
    name: 'unit_condition_score',
    ok:
      evaluateFunnelEdgeCondition({ field: 'score', op: 'gte', value: 50 }, {
        event: 'MQL',
        score: 72,
      }) &&
      !evaluateFunnelEdgeCondition({ field: 'score', op: 'gte', value: 50 }, {
        event: 'MQL',
        score: 10,
      }),
  });

  const flash = buildFallbackFunnelComplete({ templateSlug: 'flash-sale' });
  const flashNew = flash.nodes.find((n) => n.type === 'STAGE' && n.stage?.code === 'NEW');
  const timeoutFromNew = flashNew
    ? selectCanvasTransitions(flash, flashNew.id, { event: 'FORM_SUBMITTED', branch: 'success' })
    : [];
  results.push({
    name: 'unit_timeout_edge_scheduled',
    ok: timeoutFromNew.some((t) => t.kind === 'timeout' && t.event === 'TIMEOUT' && t.delayMinutes > 0),
    detail: timeoutFromNew.map((t) => `${t.kind}:${t.toNodeId}:${t.delayMinutes}`).join('|'),
  });

  results.push({
    name: 'unit_idempotency_key',
    ok: canvasRuntimeIdempotencyKey({
      funnelId: 'f1',
      publishedVersion: 2,
      leadId: 'l1',
      nodeId: 'n_form',
      event: 'FORM_SUBMITTED',
    }).startsWith('CANVAS:f1:v2:l1:n_form:FORM_SUBMITTED'),
  });

  results.push({
    name: 'unit_booking_node_type',
    ok: (FUNNEL_NODE_TYPES as readonly string[]).includes('BOOKING'),
  });

  const bookingNode = createFunnelCanvasNode({
    type: 'BOOKING',
    existingIds: new Set(['a']),
  });
  results.push({
    name: 'unit_booking_meta_default',
    ok: readCanvasNodeMeta(bookingNode).bookingEvent === 'BOOKING_CREATED',
  });

  const withRetarget = parseFunnelCompleteSpec({
    ...voucher,
    nodes: [
      ...voucher.nodes,
      {
        id: 'n_rt_form',
        type: 'RETARGET',
        label: 'Retarget form',
        meta: {
          triggerType: 'FORM_SUBMITTED',
          delayMinutes: 0,
          conditionField: 'score',
          conditionOp: 'gte',
          conditionValue: 0,
        },
      },
    ],
  });
  const retargetEntries = entryCanvasNodeIds(withRetarget, { event: 'FORM_SUBMITTED', score: 0 });
  results.push({
    name: 'unit_retarget_listens_form_trigger',
    ok: retargetEntries.includes('n_rt_form'),
    detail: retargetEntries.join(','),
  });

  results.push({
    name: 'ui_inspector',
    ok: fs.existsSync(`${repoRoot}/apps/web/src/components/funnel/funnel-canvas-inspector.tsx`),
  });

  const schema = fs.readFileSync(`${repoRoot}/packages/database/prisma/schema.prisma`, 'utf8');
  results.push({
    name: 'schema_runtime_log',
    ok: schema.includes('model FunnelRuntimeLog') && schema.includes('enum FunnelRuntimeLogStatus'),
  });

  const email = process.env.META_REVIEWER_EMAIL;
  const password = process.env.META_REVIEWER_PASSWORD;
  if (!email || !password) {
    results.push({ name: 'live_skip', ok: false, detail: 'missing META_REVIEWER credentials' });
    finish(results);
    return;
  }

  const login = await api('/auth/login', undefined, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const token = login.json?.accessToken as string | undefined;
  results.push({
    name: 'live_login',
    ok: okStatus(login.status) && !!token,
    detail: token ? 'ok' : `status=${login.status}`,
  });
  if (!token) {
    finish(results);
    return;
  }

  const gen = await api('/funnel-builder/generate-recommendations', token, {
    method: 'POST',
    body: JSON.stringify({ prompt: 'Phễu canvas runtime e2e: form lead facial spa book lịch' }),
  });
  const funnelId = gen.json?.id as string | undefined;
  results.push({
    name: 'e2e_generate',
    ok: okStatus(gen.status) && !!funnelId,
    detail: funnelId,
  });
  if (!funnelId) {
    finish(results);
    return;
  }

  const slug =
    gen.json?.selectedSlug ||
    gen.json?.recommendations?.[0]?.templateSlug ||
    'booking';
  await api(`/funnel-builder/recommendations/${funnelId}/select`, token, {
    method: 'POST',
    body: JSON.stringify({ templateSlug: slug }),
  });
  await api(`/funnel-builder/recommendations/${funnelId}/select`, token, {
    method: 'POST',
    body: JSON.stringify({ templateSlug: slug }),
  });
  const completeRes = await api(`/funnel-builder/recommendations/${funnelId}/generate-complete`, token, {
    method: 'POST',
  });
  let spec = completeRes.json?.complete as
    | {
        nodes: Array<{
          id: string;
          type: string;
          label: string;
          description?: string;
          stage?: Record<string, unknown>;
          position?: { x: number; y: number };
          meta?: Record<string, string | number | boolean | null>;
        }>;
        connections: Array<Record<string, unknown>>;
        remarketing?: { audiences?: Array<{ key: string }> };
        leadForm?: unknown;
        [k: string]: unknown;
      }
    | undefined;
  results.push({
    name: 'e2e_complete',
    ok: okStatus(completeRes.status) && spec?.schemaVersion === 'funnel-complete.v1',
    detail: completeRes.status >= 400 ? JSON.stringify(completeRes.json).slice(0, 160) : spec?.name as string,
  });

  if (spec) {
    const nodes = [...spec.nodes];
    const ids = new Set(nodes.map((n) => n.id));
    const formN = nodes.find((n) => n.type === 'FORM');
    if (formN) formN.meta = { ...(formN.meta ?? {}), formKey: 'public' };
    const autoN = nodes.find((n) => n.type === 'AUTOMATION');
    if (autoN) autoN.meta = { ...(autoN.meta ?? {}), triggerType: 'LEAD_CREATED' };
    let retarget = nodes.find((n) => n.type === 'RETARGET');
    if (!retarget) {
      retarget = {
        id: 'n_rt_e2e',
        type: 'RETARGET',
        label: 'Retarget form',
        meta: {},
      };
      nodes.push(retarget);
      ids.add(retarget.id);
    }
    retarget.meta = {
      ...(retarget.meta ?? {}),
      triggerType: 'FORM_SUBMITTED',
      delayMinutes: 0,
      conditionField: 'score',
      conditionOp: 'gte',
      conditionValue: 0,
      audienceKey: spec.remarketing?.audiences?.[0]?.key ?? null,
    };
    if (!nodes.some((n) => n.type === 'BOOKING')) {
      nodes.push({
        id: 'n_book_e2e',
        type: 'BOOKING',
        label: 'Booking created',
        meta: { bookingEvent: 'BOOKING_CREATED', scoreDelta: 0 },
      });
    }
    const patched = await api(`/funnel-builder/recommendations/${funnelId}/complete-draft`, token, {
      method: 'PATCH',
      body: JSON.stringify({ complete: { ...spec, nodes } }),
    });
    results.push({
      name: 'e2e_inspector_draft',
      ok: okStatus(patched.status) && patched.json?.mode === 'draft',
      detail: patched.status >= 400 ? JSON.stringify(patched.json).slice(0, 180) : 'ok',
    });
    spec = patched.json?.complete ?? spec;
  } else {
    results.push({ name: 'e2e_inspector_draft', ok: false, detail: 'no complete spec' });
  }

  const scoringApply = await api(
    `/funnel-builder/recommendations/${funnelId}/scoring/apply-proposal`,
    token,
    { method: 'POST' },
  );
  const scoringPatch = await api(`/funnel-builder/recommendations/${funnelId}/scoring`, token, {
    method: 'PATCH',
    body: JSON.stringify({
      mqlThreshold: 1,
      sqlThreshold: 50,
    }),
  });
  results.push({
    name: 'e2e_scoring_config',
    ok: okStatus(scoringApply.status) || okStatus(scoringPatch.status),
    detail: `apply=${scoringApply.status} patch=${scoringPatch.status} mql=${scoringPatch.json?.mqlThreshold ?? scoringApply.json?.mqlThreshold}`,
  });

  const prepared = await api(`/funnel-builder/recommendations/${funnelId}/prepare-publish`, token, {
    method: 'POST',
  });
  results.push({
    name: 'e2e_prepare',
    ok: okStatus(prepared.status) && prepared.json?.validation?.canActivate === true,
    detail: `score=${prepared.json?.validation?.score}`,
  });

  const published = await api(`/funnel-builder/recommendations/${funnelId}/publish`, token, {
    method: 'POST',
    body: JSON.stringify({ summary: 'Canvas inspector runtime e2e' }),
  });
  results.push({
    name: 'e2e_publish_active',
    ok: okStatus(published.status) && published.json?.status === 'ACTIVE',
    detail:
      published.status !== 200 && published.status !== 201
        ? `status=${published.status} ${JSON.stringify(published.json).slice(0, 180)}`
        : `v=${published.json?.publishedVersion}`,
  });

  const form = await api(`/funnel-builder/public/${funnelId}/form`);
  const liveOffer = String(form.json?.offer ?? '');
  const answers: Record<string, string> = {};
  const phone = `091${String(Date.now()).slice(-7)}`;
  for (const f of form.json?.leadForm?.fields ?? []) {
    if (f.type === 'tel') answers[f.key] = phone;
    else if (f.type === 'email') answers[f.key] = `canvas.${Date.now()}@example.com`;
    else if (f.type === 'select' && f.options?.[0]) answers[f.key] = f.options[0];
    else if (f.required) answers[f.key] = 'Canvas Runtime';
  }
  const leadRes = await api(`/funnel-builder/public/${funnelId}/lead`, undefined, {
    method: 'POST',
    body: JSON.stringify({ answers }),
  });
  const leadId = leadRes.json?.leadId as string | undefined;
  results.push({
    name: 'e2e_form_to_lead',
    ok: okStatus(leadRes.status) && !!leadId,
    detail: leadId ?? `status=${leadRes.status} ${JSON.stringify(leadRes.json).slice(0, 160)}`,
  });

  await sleep(400);
  const scoringCfg = await api(`/funnel-builder/recommendations/${funnelId}/scoring`, token);
  const mqlStageId = scoringCfg.json?.mqlStageId as string | undefined;
  const sqlStageId = scoringCfg.json?.sqlStageId as string | undefined;
  const leadRow = leadId ? await api(`/leads/${leadId}`, token) : { status: 0, json: {} };
  results.push({
    name: 'e2e_scoring',
    ok: okStatus(leadRow.status) && Number(leadRow.json?.score ?? 0) > 0,
    detail: `score=${leadRow.json?.score} q=${leadRow.json?.qualification} stage=${leadRow.json?.pipelineStatus ?? leadRow.json?.stage?.code}`,
  });
  const qNow = leadRow.json?.qualification as string | undefined;
  const wantStageId = qNow === 'SQL' ? sqlStageId : qNow === 'MQL' ? mqlStageId : undefined;
  const gotStageId = (leadRow.json?.stageId ?? leadRow.json?.stage?.id ?? leadRow.json?.funnelStageId) as
    | string
    | undefined;
  results.push({
    name: 'e2e_mql_sql_stage_sync',
    ok:
      okStatus(scoringCfg.status) &&
      Boolean(mqlStageId) &&
      (qNow === 'MQL' || qNow === 'SQL') &&
      Boolean(wantStageId) &&
      gotStageId === wantStageId,
    detail: `q=${qNow} want=${wantStageId} got=${gotStageId} mqlStage=${mqlStageId} status=${leadRow.json?.pipelineStatus}`,
  });

  const flows = await api('/automation/flows', token);
  const funnelFlows = Array.isArray(flows.json)
    ? flows.json.filter((f: { funnelId?: string | null }) => f.funnelId === funnelId)
    : [];

  const logs = await api(
    `/funnel-builder/recommendations/${funnelId}/runtime${leadId ? `?leadId=${leadId}` : ''}`,
    token,
  );
  const items = Array.isArray(logs.json) ? logs.json : [];
  results.push({
    name: 'e2e_automation',
    ok:
      (okStatus(flows.status) && funnelFlows.length > 0) ||
      items.some((l: { result?: { nodeType?: string } }) => l.result?.nodeType === 'AUTOMATION'),
    detail: `status=${flows.status} funnelFlows=${funnelFlows.length}`,
  });
  const formLogs = items.filter(
    (l: { event?: string; nodeId?: string; status?: string }) =>
      l.status === 'SUCCESS' &&
      (l.event === 'FORM_SUBMITTED' || String(l.nodeId ?? '').toLowerCase().includes('form')),
  );
  results.push({
    name: 'e2e_runtime_form',
    ok: okStatus(logs.status) && formLogs.length > 0,
    detail: items
      .slice(0, 10)
      .map((l: { nodeId?: string; event?: string; status?: string }) => `${l.nodeId}:${l.event}:${l.status}`)
      .join('|'),
  });
  const retargetOk = items.some((l: { status?: string; result?: { nodeType?: string; reason?: string; taskId?: string } }) => {
    const t = l.result?.nodeType;
    const blob = JSON.stringify(l);
    return (
      (t === 'RETARGET' || blob.includes('RETARGET') || blob.includes('n_rt_e2e')) &&
      (l.status === 'SUCCESS' || l.result?.reason === 'frequency_cap' || l.result?.reason === 'condition_failed')
    );
  });
  results.push({
    name: 'e2e_retarget_condition',
    ok: retargetOk,
    detail: `n=${items.filter((l: { result?: { nodeType?: string } }) => l.result?.nodeType === 'RETARGET').length}`,
  });

  const journey = leadId ? await api(`/leads/${leadId}/journey`, token) : { status: 0, json: {} };
  const steps: string[] = journey.json?.stepsCompleted ?? journey.json?.timeline?.map((t: { kind?: string }) => t.kind) ?? [];
  results.push({
    name: 'e2e_journey_form_lead',
    ok:
      okStatus(journey.status) &&
      (steps.includes('FORM_SUBMIT') || steps.includes('LEAD')) &&
      (Array.isArray(journey.json?.timeline) ? journey.json.timeline.length > 0 : false),
    detail: Array.isArray(steps) ? steps.join(',') : `status=${journey.status}`,
  });

  const dup = await api(`/funnel-builder/public/${funnelId}/lead`, undefined, {
    method: 'POST',
    body: JSON.stringify({ answers }),
  });
  await sleep(600);
  const logs2 = await api(
    `/funnel-builder/recommendations/${funnelId}/runtime${leadId ? `?leadId=${leadId}` : ''}`,
    token,
  );
  const items2 = Array.isArray(logs2.json) ? logs2.json : [];
  const formLogs2 = items2.filter(
    (l: { event?: string; nodeId?: string; status?: string }) =>
      l.status === 'SUCCESS' &&
      (l.event === 'FORM_SUBMITTED' || String(l.nodeId ?? '').toLowerCase().includes('form')),
  );
  results.push({
    name: 'e2e_duplicate_event_once',
    ok: okStatus(dup.status) && formLogs2.length === formLogs.length && (dup.json?.leadId === leadId || dup.json?.updated === true),
    detail: `first=${formLogs.length} second=${formLogs2.length} dupLead=${dup.json?.leadId}`,
  });

  const converted = leadId
    ? await api(`/leads/${leadId}/convert-customer`, token, { method: 'POST' })
    : { status: 0, json: {} };
  const customerId = converted.json?.customerId || converted.json?.customer?.id || converted.json?.id;
  const branchId = await ensureBranch(token);
  let bookingConversion = false;
  if (leadId && branchId) {
    const appt = await api('/appointments', token, {
      method: 'POST',
      body: JSON.stringify({
        branchId,
        leadId,
        ...(customerId ? { customerId } : {}),
        scheduledAt: new Date(Date.now() + 36 * 3600_000).toISOString(),
        durationMinutes: 60,
        note: 'Canvas e2e booking',
      }),
    });
    await sleep(800);
    const logsB = await api(
      `/funnel-builder/recommendations/${funnelId}/runtime?leadId=${leadId}`,
      token,
    );
    const j2 = await api(`/leads/${leadId}/journey`, token);
    const kinds = (j2.json?.stepsCompleted ?? j2.json?.timeline?.map((t: { kind?: string }) => t.kind) ?? []) as string[];
    bookingConversion =
      okStatus(appt.status) &&
      (kinds.includes('BOOKING') ||
        (Array.isArray(logsB.json) &&
          logsB.json.some((l: { event?: string }) => String(l.event ?? '').includes('BOOKING'))));
    results.push({
      name: 'e2e_booking_to_conversion',
      ok: bookingConversion,
      detail: appt.status >= 400 ? JSON.stringify(appt.json).slice(0, 180) : kinds.join(','),
    });
  } else {
    results.push({
      name: 'e2e_booking_to_conversion',
      ok: false,
      detail: `lead=${leadId} branch=${branchId}`,
    });
  }

  let revenueOk = false;
  if (customerId && leadId) {
    const order = await api('/finance/orders', token, {
      method: 'POST',
      body: JSON.stringify({
        customerId,
        leadId,
        ...(branchId ? { branchId } : {}),
        items: [{ name: 'Gói facial canvas', quantity: 1, unitPrice: 500000 }],
      }),
    });
    const orderId = order.json?.id as string | undefined;
    if (orderId) {
      await api('/finance/payments', token, {
        method: 'POST',
        body: JSON.stringify({
          orderId,
          amount: 500000,
          method: 'CASH',
          reference: `CV-${Date.now()}`,
        }),
      });
    }
    await sleep(900);
    const analytics = await api('/leads/funnel/analytics', token);
    const kpis = analytics.json?.kpis ?? {};
    const j3 = await api(`/leads/${leadId}/journey`, token);
    const kinds3 = (j3.json?.stepsCompleted ?? []) as string[];
    revenueOk =
      Number(kpis.revenue ?? 0) > 0 ||
      kinds3.includes('PURCHASE') ||
      Number(analytics.json?.pipeline?.counts?.purchased ?? 0) > 0;
    results.push({
      name: 'e2e_purchase_to_revenue',
      ok: revenueOk,
      detail: `rev=${kpis.revenue} purchased=${kpis.purchased} steps=${kinds3.join(',')}`,
    });
  } else {
    results.push({ name: 'e2e_purchase_to_revenue', ok: false, detail: 'no customer' });
  }

  if (spec && liveOffer) {
    const frozen = await api(`/funnel-builder/recommendations/${funnelId}/complete-draft`, token, {
      method: 'PATCH',
      body: JSON.stringify({ complete: { ...spec, offer: `${liveOffer} [draft-only]` } }),
    });
    const formAfter = await api(`/funnel-builder/public/${funnelId}/form`);
    results.push({
      name: 'e2e_active_live_frozen',
      ok:
        okStatus(frozen.status) &&
        frozen.json?.liveFrozen === true &&
        String(formAfter.json?.offer ?? '') === liveOffer,
      detail: `liveFrozen=${frozen.json?.liveFrozen} publicOfferMatch=${String(formAfter.json?.offer ?? '') === liveOffer}`,
    });
  } else {
    results.push({ name: 'e2e_active_live_frozen', ok: false, detail: 'no live offer' });
  }

  const me = await api('/auth/me', token);
  const myOrg = me.json?.organizationId || me.json?.organization?.id;
  let otherFunnelId: string | null = null;
  try {
    if (myOrg) {
      const other = await prisma.funnelRecommendation.findFirst({
        where: { organizationId: { not: myOrg } },
        select: { id: true, organizationId: true },
      });
      otherFunnelId = other?.id ?? null;
    }
  } catch {
    otherFunnelId = null;
  }
  const foreignId = otherFunnelId || '00000000-0000-4000-8000-000000000099';
  const cross = await api(`/funnel-builder/recommendations/${foreignId}`, token);
  const crossRuntime = await api(`/funnel-builder/recommendations/${foreignId}/runtime`, token);
  const crossLogs = Array.isArray(crossRuntime.json) ? crossRuntime.json : [];
  results.push({
    name: 'e2e_tenant_isolation',
    ok: cross.status >= 400 && (crossRuntime.status >= 400 || crossLogs.length === 0),
    detail: `get=${cross.status} runtime=${crossRuntime.status} n=${crossLogs.length} other=${otherFunnelId ? 'orgB' : 'uuid'}`,
  });

  const paused = await api(`/funnel-builder/recommendations/${funnelId}/pause`, token, {
    method: 'POST',
  });
  results.push({
    name: 'e2e_paused_no_run',
    ok: okStatus(paused.status) && paused.json?.status === 'PAUSED',
  });
  const afterPause = await api(`/funnel-builder/public/${funnelId}/lead`, undefined, {
    method: 'POST',
    body: JSON.stringify({ answers: { ...answers, [Object.keys(answers).find((k) => answers[k] === phone) ?? 'phone']: `092${String(Date.now()).slice(-7)}` } }),
  });
  results.push({
    name: 'e2e_paused_blocks_public',
    ok: afterPause.status >= 400,
    detail: `status=${afterPause.status}`,
  });

  finish(results);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });

