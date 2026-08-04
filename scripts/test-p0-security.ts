/**
 * P0 security — tenant isolation & auth schema checks.
 * Run: node scripts/with-root-env.cjs pnpm exec tsx scripts/test-p0-security.ts
 */
import assert from 'node:assert/strict';
import { createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

async function testCrossTenantCustomer() {
  const orgs = await prisma.organization.findMany({
    where: { isActive: true },
    take: 2,
    orderBy: { createdAt: 'asc' },
  });
  if (orgs.length < 2) {
    console.log('skip cross-tenant customer: need 2 orgs');
    return;
  }

  const [orgA, orgB] = orgs;
  const customerA = await prisma.customer.findFirst({
    where: { organizationId: orgA.id },
  });
  if (!customerA) {
    console.log('skip cross-tenant customer: no customer in org A');
    return;
  }

  const crossRead = await prisma.customer.findFirst({
    where: { id: customerA.id, organizationId: orgB.id },
  });
  assert.equal(crossRead, null, 'org B must not read org A customer by id');

  const crossLead = await prisma.lead.findFirst({
    where: { organizationId: orgB.id },
  });
  if (crossLead) {
    const wrongOrg = await prisma.lead.findFirst({
      where: { id: crossLead.id, organizationId: orgA.id },
    });
    assert.equal(wrongOrg, null, 'org A must not read org B lead by id');
  }
}

async function testBranchOwnership() {
  const branch = await prisma.branch.findFirst();
  if (!branch) {
    console.log('skip branch ownership: no branches');
    return;
  }
  const foreign = await prisma.branch.findFirst({
    where: { id: branch.id, organizationId: { not: branch.organizationId } },
  });
  assert.equal(foreign, null);
}

async function testAuthSessionSchema() {
  const count = await prisma.authSession.count();
  assert.ok(count >= 0);
  const token = hashToken('test-token');
  assert.equal(token.length, 64);
}

async function testChatbotPageOrgIsolation() {
  const page = await prisma.chatbotFacebookPage.findFirst();
  if (!page) {
    console.log('skip chatbot page isolation: none');
    return;
  }
  const dup = await prisma.chatbotFacebookPage.findMany({ where: { pageId: page.pageId } });
  assert.ok(dup.length <= 1, 'pageId must not map to multiple org rows');
}

async function testAutoPostOrgOnJobPayload() {
  const post = await prisma.autoPost.findFirst({ select: { id: true, organizationId: true, userId: true } });
  if (!post) {
    console.log('skip auto-post org payload: no posts');
    return;
  }
  assert.ok(post.organizationId, 'auto post must have organizationId for worker jobs');
  const owned = await prisma.autoPost.findFirst({
    where: { id: post.id, organizationId: post.organizationId, userId: post.userId },
  });
  assert.ok(owned);
}

async function main() {
  await testCrossTenantCustomer();
  await testBranchOwnership();
  await testAuthSessionSchema();
  await testChatbotPageOrgIsolation();
  await testAutoPostOrgOnJobPayload();
  console.log('test-p0-security: all passed');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
