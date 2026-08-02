/**
 * Automation security — tenant isolation, token không lộ qua API/audit.
 * Run: pnpm test:automation-security
 */
import assert from 'node:assert/strict';
import {
  IntegrationProvider,
  IntegrationStatus,
  MessageChannel,
  PrismaClient,
} from '@prisma/client';
import { encryptSecret } from '../apps/api/src/common/utils/encryption.util';
import {
  assertNoCredentialLeak,
  maskExternalId,
  redactForAudit,
  sanitizePublicMetadata,
} from '../apps/api/src/common/utils/token-security.util';

const prisma = new PrismaClient();
const TAG = `AUTO_SEC_${Date.now()}`;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test-encryption-key-32chars!!';

async function testCrossTenantAutomation() {
  const orgA = await prisma.organization.create({
    data: { name: `${TAG} A`, slug: `${TAG.toLowerCase()}-a` },
  });
  const orgB = await prisma.organization.create({
    data: { name: `${TAG} B`, slug: `${TAG.toLowerCase()}-b` },
  });

  const templateA = await prisma.messageTemplate.create({
    data: {
      organizationId: orgA.id,
      name: 'Tpl A',
      channel: MessageChannel.ZALO,
      body: 'Hello {{customer_name}}',
    },
  });

  const flowA = await prisma.automationFlow.create({
    data: {
      organizationId: orgA.id,
      name: 'Flow A',
      triggerType: 'MANUAL',
      messageTemplateId: templateA.id,
    },
  });

  const crossTemplate = await prisma.messageTemplate.findFirst({
    where: { id: templateA.id, organizationId: orgB.id },
  });
  assert.equal(crossTemplate, null, 'org B must not read org A template');

  const crossFlow = await prisma.automationFlow.findFirst({
    where: { id: flowA.id, organizationId: orgB.id },
  });
  assert.equal(crossFlow, null, 'org B must not read org A flow');

  const rawToken = 'EAAZaloTestToken1234567890SECRET';
  const encrypted = encryptSecret(JSON.stringify({ accessToken: rawToken }), ENCRYPTION_KEY);

  const integrationA = await prisma.integration.create({
    data: {
      organizationId: orgA.id,
      provider: IntegrationProvider.ZALO_OA,
      status: IntegrationStatus.ACTIVE,
      encryptedCredentials: encrypted,
      metadata: {
        accountHint: '****7890',
        externalAccountId: 'zalo-oa-uid-99887766',
      },
    },
  });

  const crossIntegration = await prisma.integration.findFirst({
    where: { id: integrationA.id, organizationId: orgB.id },
  });
  assert.equal(crossIntegration, null, 'org B must not read org A integration');

  await prisma.integration.delete({ where: { id: integrationA.id } });
  await prisma.automationFlow.delete({ where: { id: flowA.id } });
  await prisma.messageTemplate.delete({ where: { id: templateA.id } });
  await prisma.organization.delete({ where: { id: orgA.id } });
  await prisma.organization.delete({ where: { id: orgB.id } });
}

function testTokenRedaction() {
  const psid = '1234567890123456';
  const masked = maskExternalId(psid);
  assert.ok(!masked.includes(psid), 'masked PSID must not contain full value');
  assert.ok(masked.endsWith('3456'), 'masked PSID keeps last 4');

  const publicMeta = sanitizePublicMetadata({
    accountHint: '****1234',
    externalAccountId: 'zalo-uid-full-9988',
    accessToken: 'secret-token-value',
  });
  assert.ok(!JSON.stringify(publicMeta).includes('secret-token-value'));
  assert.ok(!JSON.stringify(publicMeta).includes('zalo-uid-full-9988'));

  const auditPayload = redactForAudit({
    credentials: { accessToken: 'my-long-access-token-value' },
    psid: '9876543210987654',
    encryptedCredentials: 'base64blob',
  });
  const auditJson = JSON.stringify(auditPayload);
  assert.ok(!auditJson.includes('my-long-access-token-value'));
  assert.ok(!auditJson.includes('9876543210987654'));
  assert.ok(!auditJson.includes('base64blob'));

  const apiResponse = {
    provider: 'ZALO_OA',
    status: 'ACTIVE',
    hasCredentials: true,
    maskedHint: '****7890',
    metadata: publicMeta,
  };
  assert.doesNotThrow(() => assertNoCredentialLeak(apiResponse, 'EAAZaloTestToken1234567890SECRET'));
}

async function testAuditLogNoRawToken() {
  const org = await prisma.organization.create({
    data: { name: `${TAG} audit`, slug: `${TAG.toLowerCase()}-audit` },
  });

  const secretToken = 'EAAFBMessengerPageTokenSECRET999';
  const auditMeta = redactForAudit({
    provider: 'ZALO_OA',
    accessToken: secretToken,
    externalUserId: 'psid-1122334455667788',
  }) as object;

  const log = await prisma.auditLog.create({
    data: {
      organizationId: org.id,
      action: 'INTEGRATION_CONNECTED',
      entityType: 'INTEGRATION',
      metadata: auditMeta,
    },
  });

  const stored = JSON.stringify(log.metadata);
  assert.ok(!stored.includes(secretToken), 'audit must not store raw token');
  assert.ok(!stored.includes('1122334455667788'), 'audit must not store full PSID');

  await prisma.auditLog.delete({ where: { id: log.id } });
  await prisma.organization.delete({ where: { id: org.id } });
}

async function main() {
  console.log(`[${TAG}] start`);
  testTokenRedaction();
  await testCrossTenantAutomation();
  await testAuditLogNoRawToken();
  console.log(`[${TAG}] PASS`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
