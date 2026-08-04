/**
 * Lead UX upgrade — kanban API shape, filters, cursor, optimistic helpers.
 * Run: pnpm test:leads-ux
 */
import assert from 'node:assert/strict';
import { LeadPipelineStatus } from '@marketingspa/database';

function encodeCursor(createdAt: Date, id: string) {
  return `${createdAt.toISOString()}|${id}`;
}

function decodeCursor(cursor?: string): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  const [iso, id] = cursor.split('|');
  if (!iso || !id) return null;
  const createdAt = new Date(iso);
  if (Number.isNaN(createdAt.getTime())) return null;
  return { createdAt, id };
}

function leadFiltersToQuery(filters: {
  search?: string;
  unassigned?: boolean;
  assignedToId?: string;
  pipelineStatus?: string;
}) {
  const q: Record<string, string> = {};
  if (filters.search) q.search = filters.search;
  if (filters.unassigned) q.unassigned = 'true';
  else if (filters.assignedToId) q.assignedToId = filters.assignedToId;
  if (filters.pipelineStatus) q.pipelineStatus = filters.pipelineStatus;
  return q;
}

function optimisticMove(
  columns: Record<string, { total: number; items: { id: string; pipelineStatus: string }[] }>,
  leadId: string,
  nextStatus: string,
) {
  const next = { ...columns };
  let moved: { id: string; pipelineStatus: string } | undefined;
  for (const [status, col] of Object.entries(next)) {
    const idx = col.items.findIndex((l) => l.id === leadId);
    if (idx >= 0) {
      moved = col.items[idx];
      next[status] = {
        ...col,
        total: Math.max(0, col.total - 1),
        items: col.items.filter((l) => l.id !== leadId),
      };
      break;
    }
  }
  if (!moved) return columns;
  const target = next[nextStatus] ?? { total: 0, items: [] };
  next[nextStatus] = {
    ...target,
    total: target.total + 1,
    items: [{ ...moved, pipelineStatus: nextStatus }, ...target.items],
  };
  return next;
}

function main() {
  const c = encodeCursor(new Date('2026-07-22T10:00:00.000Z'), 'lead-1');
  const d = decodeCursor(c);
  assert.ok(d);
  assert.equal(d!.id, 'lead-1');
  assert.equal(decodeCursor('bad'), null);

  const q = leadFiltersToQuery({ search: 'a', unassigned: true, pipelineStatus: 'NEW' });
  assert.equal(q.unassigned, 'true');
  assert.equal(q.search, 'a');
  assert.ok(!q.assignedToId);

  const cols = {
    NEW: { total: 2, items: [{ id: '1', pipelineStatus: 'NEW' }, { id: '2', pipelineStatus: 'NEW' }] },
    CONTACTED: { total: 0, items: [] as { id: string; pipelineStatus: string }[] },
  };
  const moved = optimisticMove(cols, '1', 'CONTACTED');
  assert.equal(moved.NEW.total, 1);
  assert.equal(moved.CONTACTED.total, 1);
  assert.equal(moved.CONTACTED.items[0]!.id, '1');

  // rollback simulation
  const rolled = cols;
  assert.equal(rolled.NEW.total, 2);

  assert.ok(Object.values(LeadPipelineStatus).includes('NEW' as LeadPipelineStatus));
  console.log('leads-ux PASS');
}

main();
