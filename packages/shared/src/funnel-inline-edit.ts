import { z } from 'zod';
import type { FunnelCompleteSpec, FunnelAppearance } from './funnel-complete';
import { funnelAppearanceSchema, parseFunnelCompleteSpec } from './funnel-complete';

const HTML_TAG = /<[^>]*>/g;
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Strip HTML / script patterns from user-editable funnel copy. */
export function sanitizeFunnelInlineText(input: unknown, max: number): string {
  let s = String(input ?? '').slice(0, max);
  s = s.replace(HTML_TAG, '');
  s = s.replace(/javascript:/gi, '');
  s = s.replace(/data:/gi, '');
  s = s.replace(/on\w+\s*=/gi, '');
  s = s.replace(CONTROL_CHARS, '');
  return s.replace(/\s+/g, ' ').trim();
}

export function sanitizeFunnelInlineHex(input: unknown): string | undefined {
  const s = String(input ?? '').trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(s)) return s;
  return undefined;
}

export const funnelInlineFieldPatchSchema = z
  .object({
    key: z.string().min(1).max(64),
    label: z.string().max(120).optional(),
    placeholder: z.string().max(160).optional(),
  })
  .strict();

export const funnelInlineContentPatchSchema = z
  .object({
    name: z.string().max(160).optional(),
    offer: z.string().max(300).optional(),
    summary: z.string().max(800).optional(),
    cta: z.string().max(160).optional(),
    leadForm: z
      .object({
        title: z.string().max(160).optional(),
        submitLabel: z.string().max(80).optional(),
        privacyNote: z.string().max(300).optional(),
        fields: z.array(funnelInlineFieldPatchSchema).max(20).optional(),
      })
      .strict()
      .optional(),
    appearance: funnelAppearanceSchema.partial().optional(),
  })
  .strict();

export type FunnelInlineContentPatch = z.infer<typeof funnelInlineContentPatchSchema>;

export function sanitizeFunnelInlineContentPatch(raw: unknown): FunnelInlineContentPatch {
  const parsed = funnelInlineContentPatchSchema.parse(raw);
  const out: FunnelInlineContentPatch = {};
  if (parsed.name !== undefined) out.name = sanitizeFunnelInlineText(parsed.name, 160);
  if (parsed.offer !== undefined) out.offer = sanitizeFunnelInlineText(parsed.offer, 300);
  if (parsed.summary !== undefined) out.summary = sanitizeFunnelInlineText(parsed.summary, 800);
  if (parsed.cta !== undefined) out.cta = sanitizeFunnelInlineText(parsed.cta, 160);
  if (parsed.leadForm) {
    out.leadForm = {};
    if (parsed.leadForm.title !== undefined) {
      out.leadForm.title = sanitizeFunnelInlineText(parsed.leadForm.title, 160);
    }
    if (parsed.leadForm.submitLabel !== undefined) {
      out.leadForm.submitLabel = sanitizeFunnelInlineText(parsed.leadForm.submitLabel, 80);
    }
    if (parsed.leadForm.privacyNote !== undefined) {
      out.leadForm.privacyNote = sanitizeFunnelInlineText(parsed.leadForm.privacyNote, 300);
    }
    if (parsed.leadForm.fields?.length) {
      out.leadForm.fields = parsed.leadForm.fields.map((f) => ({
        key: f.key,
        ...(f.label !== undefined
          ? { label: sanitizeFunnelInlineText(f.label, 120) }
          : {}),
        ...(f.placeholder !== undefined
          ? { placeholder: sanitizeFunnelInlineText(f.placeholder, 160) }
          : {}),
      }));
    }
  }
  if (parsed.appearance) {
    const appearance: FunnelAppearance = {};
    for (const [k, v] of Object.entries(parsed.appearance)) {
      const hex = sanitizeFunnelInlineHex(v);
      if (hex) (appearance as Record<string, string>)[k] = hex;
    }
    if (Object.keys(appearance).length) out.appearance = appearance;
  }
  return out;
}

/** Apply content-only patch — never changes field keys/types/required or graph structure. */
export function applyFunnelInlineContentPatch(
  spec: FunnelCompleteSpec,
  patch: FunnelInlineContentPatch,
): FunnelCompleteSpec {
  const next: FunnelCompleteSpec = { ...spec, leadForm: { ...spec.leadForm, fields: [...spec.leadForm.fields] } };

  if (patch.name !== undefined) next.name = patch.name || spec.name;
  if (patch.offer !== undefined) next.offer = patch.offer || spec.offer;
  if (patch.summary !== undefined) next.summary = patch.summary;
  if (patch.cta !== undefined) next.cta = patch.cta || spec.cta;

  if (patch.leadForm) {
    if (patch.leadForm.title !== undefined) next.leadForm.title = patch.leadForm.title || spec.leadForm.title;
    if (patch.leadForm.submitLabel !== undefined) {
      next.leadForm.submitLabel = patch.leadForm.submitLabel || spec.leadForm.submitLabel;
    }
    if (patch.leadForm.privacyNote !== undefined) next.leadForm.privacyNote = patch.leadForm.privacyNote;
    if (patch.leadForm.fields?.length) {
      const byKey = new Map(next.leadForm.fields.map((f) => [f.key, f]));
      for (const fp of patch.leadForm.fields) {
        const field = byKey.get(fp.key);
        if (!field) continue;
        if (fp.label !== undefined) field.label = fp.label || field.label;
        if (fp.placeholder !== undefined) field.placeholder = fp.placeholder;
      }
    }
  }

  if (patch.appearance) {
    next.appearance = { ...(spec.appearance ?? {}), ...patch.appearance };
  }

  return parseFunnelCompleteSpec(next);
}

export function funnelInlineContentChanged(
  before: FunnelCompleteSpec,
  after: FunnelCompleteSpec,
): boolean {
  return JSON.stringify(before) !== JSON.stringify(after);
}
