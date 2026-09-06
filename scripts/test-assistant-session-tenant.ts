/**
 * Integration-ish test: session tenant isolation + soft delete + allowlist invoke path
 * without live OpenAI. Uses Prisma when available.
 * Run: node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-assistant-session-tenant.ts
 */
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { ASSISTANT_PERMISSIONS } from '../packages/shared/src/assistant-tools';
import { AssistantSessionService } from '../apps/api/src/assistant/assistant.session.service';
import {
  sanitizeUserMessageForLlm,
  stripForbiddenToolArgs,
} from '../apps/api/src/assistant/assistant.prompt';

async function main() {
  assert.ok(sanitizeUserMessageForLlm('hi', 10) === 'hi');
  assert.equal(stripForbiddenToolArgs({ organizationId: 'x', a: 1 }).a, 1);

  const prisma = new PrismaClient();
  try {
    const orgA = await prisma.organization.findFirst({
      where: { isActive: true },
      select: { id: true },
    });
    if (!orgA) {
      console.log('SKIP: no org');
      return;
    }
    const userA = await prisma.user.findFirst({
      where: { organizationId: orgA.id, isActive: true, deletedAt: null },
    });
    if (!userA) {
      console.log('SKIP: no user');
      return;
    }

    const orgB = await prisma.organization.findFirst({
      where: { isActive: true, id: { not: orgA.id } },
      select: { id: true },
    });

    // AssistantSessionService expects PrismaService shape — use prisma as never
    const sessions = new AssistantSessionService(prisma as never);
    const authA = {
      id: userA.id,
      email: userA.email,
      name: userA.name,
      role: 'SALE',
      organizationId: orgA.id,
      permissions: [ASSISTANT_PERMISSIONS.USE],
    };

    const created = await sessions.create(authA, { title: 'test-orch', timezone: 'Asia/Ho_Chi_Minh' });
    assert.equal(created.organizationId, orgA.id);
    assert.equal(created.userId, userA.id);

    const got = await sessions.getOwned(authA, created.id, true);
    assert.equal(got.id, created.id);

    await sessions.appendMessage(authA, created.id, {
      role: 'USER',
      content: 'Doanh thu hôm nay?',
      meta: { requestId: 'test' },
    });
    await sessions.appendMessage(authA, created.id, {
      role: 'TOOL',
      content: JSON.stringify({ ok: true, tool: 'finance.dashboard', evidence: [] }),
      toolName: 'finance.dashboard',
      toolCallId: 'call_test',
      meta: { ok: true },
    });

    if (orgB) {
      const authCross = { ...authA, organizationId: orgB.id };
      let threw = false;
      try {
        await sessions.getOwned(authCross, created.id, false);
      } catch {
        threw = true;
      }
      assert.equal(threw, true, 'cross-org getOwned must fail');
    }

    // foreign user same org should not see
    const otherUser = await prisma.user.findFirst({
      where: {
        organizationId: orgA.id,
        id: { not: userA.id },
        isActive: true,
        deletedAt: null,
      },
    });
    if (otherUser) {
      const authOther = {
        ...authA,
        id: otherUser.id,
        email: otherUser.email,
        name: otherUser.name,
      };
      let threw = false;
      try {
        await sessions.getOwned(authOther, created.id, false);
      } catch {
        threw = true;
      }
      assert.equal(threw, true, 'other user cannot own session');
    }

    const archived = await sessions.deleteOwned(authA, created.id);
    assert.equal(archived.status, 'ARCHIVED');

    console.log('ALL_PASS assistant-session-tenant');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
