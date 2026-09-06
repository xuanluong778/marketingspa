/**
 * Prompt 14 — Funnel Validator + Funnel Score (unit + live smoke).
 *   pnpm test:funnel-validator
 */
import fs from 'node:fs';
import type { FunnelBlueprintDraft, FunnelCompleteSpec } from '../packages/shared/src';
import {
  buildFunnelValidatorExplanation,
  FUNNEL_ACTIVATE_MIN_SCORE,
  validateFunnelBlueprintDraft,
  validateFunnelCompleteSpec,
} from '../packages/shared/src/funnel-validator';

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

function minimalCompleteSpec(): FunnelCompleteSpec {
  return {
    schemaVersion: 'funnel-complete.v1',
    templateSlug: 'booking',
    name: 'Test Spa Funnel',
    strategy:
      'Facebook Ads targeting women 25-45 in Ho Chi Minh City interested in spa facial treatments',
    offer: 'Giảm 30% liệu trình facial cho khách mới đăng ký qua form landing page',
    cta: 'Đặt lịch ngay — nhận ưu đãi',
    stages: [
      { name: 'Lead mới', code: 'NEW', category: 'OPEN', position: 0, probability: 10 },
      { name: 'Đã liên hệ', code: 'CONTACTED', category: 'IN_PROGRESS', position: 1, probability: 25 },
      { name: 'Đã đặt lịch', code: 'BOOKED', category: 'BOOKING', position: 2, probability: 50 },
    ],
    nodes: [
      { id: 'n1', type: 'TRAFFIC', label: 'Facebook Ads', meta: { utmSource: 'facebook' } },
      { id: 'n2', type: 'LANDING', label: 'Landing page' },
      { id: 'n3', type: 'FORM', label: 'Lead form' },
      { id: 'n4', type: 'OFFER', label: 'Offer node' },
      { id: 'n5', type: 'CTA', label: 'CTA block' },
      { id: 'n6', type: 'GOAL', label: 'Purchase goal' },
    ],
    connections: [
      { id: 'c1', from: 'n1', to: 'n2' },
      { id: 'c2', from: 'n2', to: 'n3' },
      { id: 'c3', from: 'n3', to: 'n4' },
      { id: 'c4', from: 'n4', to: 'n5' },
      { id: 'c5', from: 'n5', to: 'n6' },
    ],
    leadForm: {
      title: 'Đăng ký tư vấn',
      submitLabel: 'Gửi',
      fields: [
        { key: 'name', label: 'Họ tên', type: 'text', required: true },
        { key: 'phone', label: 'SĐT', type: 'tel', required: true },
        { key: 'email', label: 'Email', type: 'email', required: false },
        {
          key: 'service',
          label: 'Dịch vụ',
          type: 'select',
          required: true,
          options: ['Facial', 'Massage'],
        },
      ],
    },
    chatbotFlow: {
      name: 'CSKH',
      entryStepId: 's1',
      steps: [
        { id: 's1', type: 'message', content: 'Xin chào', nextId: 's2' },
        { id: 's2', type: 'end', content: 'Cảm ơn bạn' },
      ],
    },
    followUp: [
      {
        name: 'FU Zalo',
        trigger: 'LEAD_CREATED',
        delayMinutes: 60,
        channel: 'ZALO',
        message: 'Cảm ơn bạn đã đăng ký — team sẽ liên hệ sớm',
      },
      {
        name: 'FU SMS',
        trigger: 'LEAD_UNTOUCHED',
        delayMinutes: 1440,
        channel: 'SMS',
        message: 'Nhắc lại ưu đãi facial',
      },
    ],
    automations: [
      {
        name: 'Gọi lead mới',
        triggerType: 'LEAD_CREATED',
        delayMinutes: 0,
        actions: [{ type: 'CREATE_TASK', title: 'Gọi lead trong 30p', dueInMinutes: 30 }],
      },
    ],
    leadScoring: {
      maxScore: 100,
      hotThreshold: 70,
      rules: [{ key: 'phone', label: 'Có SĐT', points: 20, condition: 'phone present' }],
    },
    salesHandoff: { trigger: 'HOT_SCORE', assigneeRole: 'SALE', slaMinutes: 30 },
    booking: {
      enabled: true,
      serviceName: 'Facial',
      durationMinutes: 60,
      bufferMinutes: 15,
      confirmationRequired: true,
      reminderHoursBefore: [24],
    },
    remarketing: {
      audiences: [{ key: 'abandon', label: 'Abandoned form' }],
      channels: ['FACEBOOK'],
      offer: 'Retarget 20% off',
      frequencyCapDays: 7,
    },
    conversionGoal: { code: 'PURCHASE', label: 'Mua gói dịch vụ', primaryEvent: 'PURCHASE' },
    kpis: [
      { key: 'cpl', label: 'CPL', target: 50000, unit: 'currency' },
      { key: 'cr', label: 'CR', target: 5, unit: 'percent' },
    ],
    mode: 'draft',
    disclaimers: [],
  };
}

function goodBlueprint(): FunnelBlueprintDraft {
  return {
    name: 'Spa blueprint',
    summary: 'Lead Facebook → book → visit → purchase với nhắc lịch',
    industryHint: 'spa',
    stages: [
      { name: 'Lead mới', code: 'NEW', category: 'OPEN', position: 0 },
      { name: 'Đã liên hệ', code: 'CONTACTED', category: 'IN_PROGRESS', position: 1 },
      { name: 'Đã đặt lịch', code: 'BOOKED', category: 'BOOKING', position: 2 },
    ],
    flows: [
      {
        name: 'Chào lead mới',
        triggerType: 'LEAD_CREATED',
        delayMinutes: 0,
        actions: [{ type: 'CREATE_TASK', title: 'Gọi lead', dueInMinutes: 30 }],
      },
      {
        name: 'Nhắc lịch 24h',
        triggerType: 'APPOINTMENT_24H_BEFORE',
        delayMinutes: 60,
        actions: [{ type: 'CREATE_TASK', title: 'Nhắc khách', dueInMinutes: 30 }],
      },
    ],
  };
}

async function main() {
  const results: Case[] = [];
  const repoRoot = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

  const good = validateFunnelCompleteSpec(minimalCompleteSpec());
  results.push({
    name: 'unit_complete_ready',
    ok: good.ready && good.canActivate && good.score >= FUNNEL_ACTIVATE_MIN_SCORE,
    detail: `score=${good.score}`,
  });
  results.push({
    name: 'unit_complete_checks',
    ok: good.checks.some((c) => c.id === 'traffic_source' && c.passed),
  });
  results.push({
    name: 'unit_complete_dimensions',
    ok: Object.values(good.dimensions).every((d) => d.score <= d.max),
  });

  const broken = validateFunnelCompleteSpec({
    ...minimalCompleteSpec(),
    nodes: [
      { id: 'solo', type: 'OFFER', label: 'Orphan' },
      { id: 'n2', type: 'FORM', label: 'Form' },
    ],
    connections: [],
    offer: '',
    cta: '',
    followUp: [],
    kpis: [],
  });
  results.push({
    name: 'unit_complete_blocks_orphan',
    ok: !broken.ready && broken.blocking.length > 0,
  });

  const bp = validateFunnelBlueprintDraft(goodBlueprint());
  results.push({
    name: 'unit_blueprint_can_activate',
    ok: bp.ready && bp.canActivate && bp.score >= FUNNEL_ACTIVATE_MIN_SCORE,
    detail: `score=${bp.score}`,
  });

  const bpBad = validateFunnelBlueprintDraft({
    name: 'Empty',
    stages: [{ name: 'Only', code: 'ONLY', position: 0 }],
    flows: [],
  });
  results.push({ name: 'unit_blueprint_blocks', ok: !bpBad.canActivate });

  const explain = buildFunnelValidatorExplanation(broken);
  results.push({
    name: 'unit_explanation_no_kpi',
    ok: explain.includes('cấu hình') && !explain.match(/\d+% ROAS/i),
  });

  results.push({
    name: 'ui_validator_panel',
    ok: fs.existsSync(`${repoRoot}/apps/web/src/components/funnel/funnel-validator-panel.tsx`),
  });
  results.push({
    name: 'ui_validator_hook',
    ok: fs.readFileSync(`${repoRoot}/apps/web/src/hooks/use-funnel-validator.ts`, 'utf8').includes('useFunnelValidation'),
  });
  results.push({
    name: 'api_validator_service',
    ok: fs.existsSync(`${repoRoot}/apps/api/src/funnel-builder/funnel-validator.service.ts`),
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
      const postVal = await api('/funnel-builder/validate', token, {
        method: 'POST',
        body: JSON.stringify({ draft: goodBlueprint() }),
      });
      results.push({
        name: 'live_validate_draft',
        ok:
          (postVal.status === 200 || postVal.status === 201) &&
          typeof postVal.json?.score === 'number',
        detail:
          postVal.status !== 200 && postVal.status !== 201
            ? `status=${postVal.status} ${JSON.stringify(postVal.json).slice(0, 180)}`
            : undefined,
      });

      const recs = await api('/funnel-builder/recommendations', token);
      const first = (recs.json as Array<{ id: string; completeSpec?: unknown }>)?.[0];
      if (first?.id) {
        const val = await api(
          `/funnel-builder/recommendations/${first.id}/validate`,
          token,
        );
        results.push({
          name: 'live_validate_recommendation',
          ok: val.status === 200 && Array.isArray(val.json?.checks),
        });
      } else {
        results.push({ name: 'live_validate_recommendation', ok: true, detail: 'no recs' });
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
