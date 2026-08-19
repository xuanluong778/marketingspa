/**
 * Small pure helpers for Work Task detail modal (unit-testable).
 */

export type WorkChecklistDraftItem = {
  id?: string;
  title: string;
  isDone: boolean;
  sortOrder: number;
};

/** Default Trello-like color palette (id is stable; stored in task.labels). */
export const WORK_LABEL_COLORS = [
  { id: 'green', hex: '#22c55e', className: 'bg-emerald-500' },
  { id: 'yellow', hex: '#facc15', className: 'bg-yellow-400' },
  { id: 'orange', hex: '#fb923c', className: 'bg-orange-400' },
  { id: 'red', hex: '#f87171', className: 'bg-red-400' },
  { id: 'purple', hex: '#c084fc', className: 'bg-purple-400' },
  { id: 'blue', hex: '#38bdf8', className: 'bg-sky-400' },
] as const;

export type WorkLabelColorId = (typeof WORK_LABEL_COLORS)[number]['id'];

export type WorkLabelToken = {
  /** Exact string stored on the task / sent to API */
  token: string;
  colorId: WorkLabelColorId | 'custom';
  title: string;
  hex: string;
};

const COLOR_IDS = new Set<string>(WORK_LABEL_COLORS.map((c) => c.id));

function colorHex(id: string): string {
  return WORK_LABEL_COLORS.find((c) => c.id === id)?.hex ?? '#94a3b8';
}

/** Encode palette label for task.labels (pure string API). */
export function encodeWorkLabel(colorId: string, title?: string): string {
  const t = (title ?? '').trim();
  if (!COLOR_IDS.has(colorId)) return t || colorId;
  return t ? `${colorId}:${t}` : colorId;
}

/** Parse free-form or color-encoded label tokens. */
export function parseWorkLabel(raw: string): WorkLabelToken {
  const token = raw.trim();
  const colon = token.indexOf(':');
  if (colon > 0) {
    const maybeColor = token.slice(0, colon);
    const title = token.slice(colon + 1).trim();
    if (COLOR_IDS.has(maybeColor)) {
      return {
        token,
        colorId: maybeColor as WorkLabelColorId,
        title,
        hex: colorHex(maybeColor),
      };
    }
  }
  if (COLOR_IDS.has(token)) {
    return {
      token,
      colorId: token as WorkLabelColorId,
      title: '',
      hex: colorHex(token),
    };
  }
  // Legacy free-text → stable color from hash
  let hash = 0;
  for (let i = 0; i < token.length; i++) hash = (hash * 31 + token.charCodeAt(i)) >>> 0;
  const palette = WORK_LABEL_COLORS[hash % WORK_LABEL_COLORS.length]!;
  return { token, colorId: 'custom', title: token, hex: palette.hex };
}

/** Default catalog rows (palette base + existing task labels). */
export function buildLabelCatalog(selected: string[], extra: string[] = []): WorkLabelToken[] {
  const base = WORK_LABEL_COLORS.map((c) => parseWorkLabel(c.id));
  const seen = new Set(base.map((b) => b.token));
  const extras: WorkLabelToken[] = [];
  for (const raw of [...selected, ...extra]) {
    const t = raw.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    extras.push(parseWorkLabel(t));
  }
  return [...base, ...extras];
}

export function toggleToken(list: string[], token: string): string[] {
  const set = new Set(list);
  if (set.has(token)) set.delete(token);
  else set.add(token);
  return Array.from(set);
}

export function renameLabelToken(
  list: string[],
  oldToken: string,
  colorId: string,
  title: string,
): string[] {
  const next = encodeWorkLabel(colorId, title);
  return ensureUniqueStrings(list.map((t) => (t === oldToken ? next : t)));
}

export function ensureUniqueStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const t = raw.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export function filterByQuery<T>(items: T[], query: string, getText: (item: T) => string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => getText(item).toLowerCase().includes(q));
}

export function parseLabelsCsv(raw: string): string[] {
  return ensureUniqueStrings(
    raw
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function formatLabelsCsv(labels: string[] | undefined | null): string {
  return (labels ?? []).join(', ');
}

/** True when editor description differs from last saved snapshot. */
export function isDescriptionDirty(saved: string | null | undefined, draft: string): boolean {
  return (saved ?? '').trim() !== draft.trim();
}

export function toggleChecklistItem(
  items: WorkChecklistDraftItem[],
  index: number,
): WorkChecklistDraftItem[] {
  return items.map((it, i) => (i === index ? { ...it, isDone: !it.isDone } : it));
}

export function checklistProgress(items: WorkChecklistDraftItem[]): number {
  if (!items.length) return 0;
  const done = items.filter((i) => i.isDone).length;
  return Math.round((done / items.length) * 100);
}

/** Merge activity sources into a single chronological feed. */
export function mergeActivityFeed(args: {
  history: Array<{
    id: string;
    createdAt: string;
    fromColumnKey?: string | null;
    toColumnKey: string;
    action: string;
    note?: string | null;
    actor?: { name?: string } | null;
  }>;
  reviews: Array<{
    id: string;
    createdAt: string;
    type: string;
    note?: string | null;
    revisionNumber: number;
    submittedBy?: { name?: string } | null;
    reviewedBy?: { name?: string } | null;
  }>;
}): Array<{ id: string; createdAt: string; kind: 'status' | 'review'; text: string }> {
  const status = args.history.map((h) => ({
    id: `s-${h.id}`,
    createdAt: h.createdAt,
    kind: 'status' as const,
    text: `${h.actor?.name || 'Hệ thống'}: ${h.fromColumnKey || '—'} → ${h.toColumnKey} (${h.action})${
      h.note ? ` — ${h.note}` : ''
    }`,
  }));
  const reviews = args.reviews.map((r) => ({
    id: `r-${r.id}`,
    createdAt: r.createdAt,
    kind: 'review' as const,
    text: `${r.reviewedBy?.name || r.submittedBy?.name || '—'}: ${r.type} · rev ${r.revisionNumber}${
      r.note ? ` — ${r.note}` : ''
    }`,
  }));
  return [...status, ...reviews].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function confirmDiscardUnsavedDescription(isDirty: boolean): boolean {
  if (!isDirty) return true;
  if (typeof window === 'undefined') return true;
  return window.confirm('Mô tả chưa lưu. Bạn có chắc muốn đóng?');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Markdown line stored in task description for an uploaded file. */
export function attachmentDescriptionLine(name: string, id: string): string {
  return `[${name}](attachment:${id})`;
}

export function appendAttachmentToDescription(
  description: string,
  name: string,
  id: string,
): string {
  if (description.includes(`(attachment:${id})`)) return description;
  const line = attachmentDescriptionLine(name, id);
  if (!description.trim()) return line;
  return `${description.replace(/\s+$/, '')}\n${line}`;
}

export function removeAttachmentFromDescription(
  description: string,
  id: string,
  name?: string,
): string {
  let next = description.replace(
    new RegExp(`(?:\\r?\\n)?\\[[^\\]]*\\]\\(attachment:${escapeRegExp(id)}\\)`, 'g'),
    '',
  );
  if (name) {
    next = next.replace(
      new RegExp(`(?:\\r?\\n)?\\[${escapeRegExp(name)}\\]\\([^)\\n]*\\)`, 'g'),
      '',
    );
  }
  return next.replace(/\n{3,}/g, '\n\n').replace(/^\s+|\s+$/g, '');
}

export function commentBodyForAttachment(name: string, id: string): string {
  return `📎 Tài liệu: ${attachmentDescriptionLine(name, id)}`;
}

export function fileExtensionBadge(name: string): string {
  const m = name.match(/\.([a-z0-9]+)$/i);
  return (m?.[1] || 'FILE').toUpperCase().slice(0, 5);
}
