/**
 * Public form → Lead/CRM capture (no mocked PASS).
 *   pnpm exec tsx scripts/test-funnel-form-capture.ts
 */
import {
  formatFunnelDatetimeDisplay,
  mapFunnelContactChannelToCode,
  parseFunnelDatetimeLocal,
} from '../packages/shared/src/funnel-form-fields';
import {
  formatFunnelFieldDisplayValue,
  mapFunnelFormAnswersToLead,
  readFunnelFormAnswer,
  validateFunnelFormAnswers,
} from '../packages/shared/src/funnel-runtime';
import { buildFallbackFunnelComplete, parseFunnelCompleteSpec } from '../packages/shared/src/funnel-complete';

type Case = { name: string; ok: boolean; detail?: string };

const API = (process.env.API_URL?.replace(/\/$/, '') || 'http://127.0.0.1:4000').replace(
  /\/api\/v1$/,
  '',
);
  const FUNNEL_ID = process.env.FUNNEL_CAPTURE_ID || 'dbdc8966-9739-4c19-bdeb-9dd8d4e6e985';

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

function mapperCases(): Case[] {
  const spec = buildFallbackFunnelComplete({
    templateSlug: 'voucher',
  });
  const preferredDatetime = '2026-08-25T14:30';
  const byId: Record<string, string | boolean> = {};
  for (const f of spec.leadForm.fields) {
    const id = `fld_${f.key}`;
    (f as { id?: string }).id = id;
    if (f.key === 'full_name') byId[id] = 'Nguyễn Văn Capture';
    else if (f.type === 'tel') byId[id] = '0912345678';
    else if (f.type === 'email') byId[id] = 'capture@example.com';
    else if (f.type === 'datetime' || f.key === 'preferred_time') byId[id] = preferredDatetime;
    else if (f.type === 'contact_channel') byId[id] = 'Zalo';
    else if (f.type === 'select' && f.options?.[0]) byId[id] = f.options[0];
    else if (f.type === 'radio' && f.options?.[0]) byId[id] = f.options[0];
    else if (f.type === 'checkbox') byId[id] = true;
    else if (f.key === 'note') byId[id] = 'Muốn trị mụn';
  }
  const valid = validateFunnelFormAnswers(spec, byId);
  const mapped = mapFunnelFormAnswersToLead(spec, byId);
  const nameField = spec.leadForm.fields.find((f) => f.key === 'full_name')!;
  const timeField = spec.leadForm.fields.find((f) => f.key === 'preferred_time')!;
  const channelField = spec.leadForm.fields.find((f) => f.key === 'contact_via')!;
  const customChannelSpec = {
    ...spec,
    leadForm: {
      ...spec.leadForm,
      fields: spec.leadForm.fields.map((f) =>
        f.key === 'contact_via' ? { ...f, type: 'contact_channel' as const } : f,
      ),
    },
  };
  const customValid = validateFunnelFormAnswers(customChannelSpec, {
    ...byId,
    fld_contact_via: 'Telegram',
    contact_via: 'Telegram',
  });
  const formattedTime = formatFunnelFieldDisplayValue(timeField, preferredDatetime);
  const invalidPhone = validateFunnelFormAnswers(spec, { ...byId, fld_phone: '12345', phone: '12345' });
  const channelCode = mapFunnelContactChannelToCode('Zalo');
  const dtParts = parseFunnelDatetimeLocal(preferredDatetime);
  return [
    {
      name: 'unit_read_by_field_id',
      ok: readFunnelFormAnswer(nameField, byId) === 'Nguyễn Văn Capture',
    },
    {
      name: 'unit_REQUEST_VALIDATION',
      ok: invalidPhone.ok === false && (invalidPhone.issues ?? []).some((i) => /sđt/i.test(i)),
      detail: invalidPhone.ok ? 'expected fail' : JSON.stringify(invalidPhone.issues),
    },
    {
      name: 'unit_DATE_TIME',
      ok: dtParts.date === '2026-08-25' && dtParts.time === '14:30',
      detail: JSON.stringify(dtParts),
    },
    {
      name: 'unit_CONTACT_CHANNEL',
      ok: channelCode === 'ZALO' && mapFunnelContactChannelToCode('Telegram') === 'OTHER',
      detail: channelCode,
    },
    {
      name: 'unit_validate_answers_by_id',
      ok: valid.ok === true,
      detail: valid.ok ? undefined : JSON.stringify(valid.issues),
    },
    {
      name: 'unit_datetime_display_format',
      ok: formattedTime.includes('25') && formattedTime.includes('08') && formattedTime.includes('2026'),
      detail: formattedTime,
    },
    {
      name: 'unit_contact_channel_custom',
      ok: customValid.ok === true,
      detail: customValid.ok ? undefined : JSON.stringify(customValid.issues),
    },
    {
      name: 'unit_map_name_phone_email_extra',
      ok:
        mapped.name === 'Nguyễn Văn Capture' &&
        mapped.phone === '0912345678' &&
        mapped.email === 'capture@example.com' &&
        (mapped.note ?? '').includes('Muốn trị mụn') &&
        (mapped.note ?? '').includes(formatFunnelDatetimeDisplay(preferredDatetime)) &&
        (mapped.note ?? '').includes('Zalo'),
      detail: JSON.stringify({ name: mapped.name, phone: mapped.phone, email: mapped.email, note: mapped.note }),
    },
    {
      name: 'unit_parse_field_id_allowed',
      ok: (() => {
        try {
          parseFunnelCompleteSpec({
            ...spec,
            leadForm: {
              ...spec.leadForm,
              fields: spec.leadForm.fields.map((f) => ({ ...f, id: `id_${f.key}` })),
            },
          });
          return true;
        } catch (e) {
          return false;
        }
      })(),
    },
  ];
}

async function main() {
  const results: Case[] = [...mapperCases()];

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
  results.push({
    name: 'live_login',
    ok: okStatus(login.status) && !!token,
    detail: `status=${login.status}`,
  });
  if (!token) {
    print(results);
    process.exit(1);
  }

  const form = await api(`/funnel-builder/public/${FUNNEL_ID}/form`);
  const fields = form.json?.leadForm?.fields as Array<{
    key: string;
    id?: string;
    type: string;
    required: boolean;
    options?: string[];
    label: string;
  }> | undefined;
  results.push({
    name: 'live_public_form',
    ok: okStatus(form.status) && Array.isArray(fields) && fields.length >= 2,
    detail: `status=${form.status} fields=${fields?.length ?? 0} formId=${form.json?.formId ?? ''}`,
  });
  if (!fields?.length) {
    print(results);
    process.exit(1);
  }

  const badSubmit = await api(`/funnel-builder/public/${FUNNEL_ID}/lead`, undefined, {
    method: 'POST',
    body: JSON.stringify({
      answers: { full_name: 'Bad Phone', phone: '12345', contact_via: 'Zalo' },
      formId: form.json?.formId,
    }),
  });
  results.push({
    name: 'REQUEST_VALIDATION',
    ok:
      badSubmit.status === 400 &&
      Array.isArray(badSubmit.json?.issues) &&
      (badSubmit.json.issues as string[]).some((i) => /sđt/i.test(i)),
    detail: JSON.stringify({ status: badSubmit.status, issues: badSubmit.json?.issues }),
  });

  const stamp = Date.now().toString();
  const phone = `098${stamp.slice(-7)}`;
  const fullName = `Capture ${stamp.slice(-6)}`;
  const mail = `capture.${stamp}@example.com`;
  const preferredDatetime = '2026-08-25T15:45';
  const contactChannel = 'Zalo';
  const answers: Record<string, string | boolean> = {};
  for (const f of fields) {
    const value =
      f.type === 'tel' || f.key === 'phone'
        ? phone
        : f.type === 'email' || f.key === 'email'
          ? mail
          : f.type === 'datetime' || f.key === 'preferred_time'
            ? preferredDatetime
            : f.type === 'contact_channel' || f.key === 'contact_via'
                ? contactChannel
              : f.type === 'select' && f.options?.[0]
                ? f.options[0]
                : f.type === 'radio' && f.options?.[0]
                  ? f.options[0]
                  : f.type === 'checkbox'
                    ? true
                    : f.type === 'textarea' || f.key === 'note'
                      ? 'Nhu cầu e2e capture'
                      : f.required || /name|họ|tên/i.test(`${f.key} ${f.label}`)
                        ? fullName
                        : `extra-${f.key}`;
    answers[f.key] = value;
    if (f.id) answers[f.id] = value;
    answers[`fld_${f.key}`] = value;
  }

  const submitted = await api(`/funnel-builder/public/${FUNNEL_ID}/lead`, undefined, {
    method: 'POST',
    body: JSON.stringify({
      answers,
      formId: form.json?.formId,
      landingPage: `https://marketingautoaz.com/f/${FUNNEL_ID}?utm_source=e2e`,
      attribution: {
        utmSource: 'e2e-capture',
        utmMedium: 'lead_form',
        utmCampaign: 'form-fix',
      },
    }),
  });
  const leadId = submitted.json?.leadId as string | undefined;
  results.push({
    name: 'live_submit_create',
    ok: okStatus(submitted.status) && submitted.json?.ok === true && !!leadId && submitted.json?.updated !== true,
    detail: `status=${submitted.status} leadId=${leadId ?? ''} updated=${submitted.json?.updated} ${JSON.stringify(submitted.json).slice(0, 180)}`,
  });
  if (!leadId) {
    print(results);
    process.exit(1);
  }

  results.push({
    name: 'FUNNEL_SUBMIT_E2E',
    ok: okStatus(submitted.status) && submitted.json?.ok === true && !!leadId,
    detail: `leadId=${leadId}`,
  });

  const crm = await api(`/leads/${leadId}`, token);
  const note = String(crm.json?.note ?? '');
  const timeField = fields.find((f) => f.key === 'preferred_time');
  const channelField = fields.find((f) => f.key === 'contact_via');
  const dtPartsLive = parseFunnelDatetimeLocal(preferredDatetime);
  const expectTime =
    !timeField?.key ||
    note.includes(formatFunnelDatetimeDisplay(preferredDatetime)) ||
    note.includes(dtPartsLive.date) ||
    /sáng|chiều|tối/i.test(note);
  const expectChannel =
    !channelField?.key || note.toLowerCase().includes(contactChannel.toLowerCase());
  results.push({
    name: 'CRM_LEAD_CREATED',
    ok:
      okStatus(crm.status) &&
      crm.json?.name === fullName &&
      String(crm.json?.phone ?? '').includes(phone.slice(-9)) &&
      crm.json?.email === mail &&
      crm.json?.funnelRecommendationId === FUNNEL_ID &&
      crm.json?.organizationId &&
      /nhu cầu e2e capture/i.test(note) &&
      expectTime &&
      expectChannel,
    detail: JSON.stringify({
      name: crm.json?.name,
      phone: crm.json?.phone,
      email: crm.json?.email,
      funnelRecommendationId: crm.json?.funnelRecommendationId,
      note: note.slice(0, 220),
      expectTime,
      expectChannel,
    }),
  });

  const attr = crm.json?.attribution ?? {};
  results.push({
    name: 'live_utm_source',
    ok: attr?.utmSource === 'e2e-capture' || crm.json?.leadSource?.code === 'FUNNEL',
    detail: JSON.stringify({ utmSource: attr?.utmSource, source: crm.json?.leadSource?.code }),
  });

  const journey = await api(`/leads/${leadId}/journey`, token);
  const formStep = (journey.json?.timeline as Array<{ kind?: string; metadata?: Record<string, unknown> }> | undefined)?.find(
    (t) => t.kind === 'FORM_SUBMIT',
  );
  const extra = (formStep?.metadata?.extra as Array<{ key?: string; value?: string }> | undefined) ?? [];
  const hasDateExtra = extra.some((e) => e.key === 'preferred_date' && e.value === dtPartsLive.date);
  const hasTimeExtra = extra.some((e) => e.key === 'preferred_time_slot' && e.value === dtPartsLive.time);
  const hasChannelCode = extra.some(
    (e) => e.key === 'contact_via_code' && e.value === mapFunnelContactChannelToCode(contactChannel),
  );
  results.push({
    name: 'DATE_TIME',
    ok:
      timeField?.key && timeField.type !== 'select'
        ? expectTime && (hasDateExtra || note.includes(formatFunnelDatetimeDisplay(preferredDatetime)))
        : expectTime,
    detail: JSON.stringify({ expectTime, hasDateExtra, hasTimeExtra, note: note.slice(0, 120) }),
  });
  results.push({
    name: 'CONTACT_CHANNEL',
    ok: expectChannel && (hasChannelCode || !channelField?.key),
    detail: JSON.stringify({ expectChannel, hasChannelCode, extra: extra.slice(0, 6) }),
  });
  results.push({
    name: 'live_journey_form_submit_linked',
    ok:
      okStatus(journey.status) &&
      journey.json?.leadId === leadId &&
      journey.json?.leadName === fullName &&
      journey.json?.phone &&
      String(journey.json.phone).includes(phone.slice(-9)) &&
      formStep?.metadata?.phone &&
      String(formStep.metadata.formId || '').length > 0,
    detail: JSON.stringify({
      leadName: journey.json?.leadName,
      phone: journey.json?.phone,
      email: journey.json?.email,
      formMeta: formStep?.metadata,
    }).slice(0, 400),
  });

  const funnelJourney = await api(`/funnel-builder/recommendations/${FUNNEL_ID}/journey`, token);
  const listed = (funnelJourney.json?.leads as Array<{ leadId?: string; leadName?: string; phone?: string }> | undefined) ?? [];
  results.push({
    name: 'live_xem_khach_hang_lists_lead',
    ok: listed.some((l) => l.leadId === leadId && l.leadName === fullName && String(l.phone ?? '').includes(phone.slice(-9))),
    detail: `count=${listed.length} names=${listed.map((l) => l.leadName).slice(0, 5).join('|')}`,
  });

  await new Promise((r) => setTimeout(r, 2100));
  const again = await api(`/funnel-builder/public/${FUNNEL_ID}/lead`, undefined, {
    method: 'POST',
    body: JSON.stringify({
      answers: { ...answers, full_name: `${fullName} Updated`, fld_full_name: `${fullName} Updated` },
      formId: form.json?.formId,
    }),
  });
  results.push({
    name: 'live_duplicate_updates_same_lead',
    ok: okStatus(again.status) && again.json?.leadId === leadId && again.json?.updated === true,
    detail: `leadId=${again.json?.leadId} updated=${again.json?.updated}`,
  });

  const crm2 = await api(`/leads/${leadId}`, token);
  results.push({
    name: 'live_duplicate_name_updated_no_clone',
    ok: crm2.json?.name === `${fullName} Updated` && crm2.json?.id === leadId,
    detail: `name=${crm2.json?.name}`,
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
