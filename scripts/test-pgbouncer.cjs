/**
 * Verify Prisma can query through PgBouncer (transaction mode).
 */
const { PrismaClient } = require('../packages/database/node_modules/@prisma/client');

function viaBouncer(url) {
  const u = new URL(url);
  u.hostname = '127.0.0.1';
  u.port = '6432';
  u.searchParams.set('pgbouncer', 'true');
  u.searchParams.set('connection_limit', '3');
  u.searchParams.set('pool_timeout', '20');
  if (!u.searchParams.has('schema')) u.searchParams.set('schema', 'public');
  return u.toString();
}

async function main() {
  const url = viaBouncer(process.env.DATABASE_URL || '');
  const p = new PrismaClient({ datasources: { db: { url } } });
  try {
    const rows = await Promise.all(
      Array.from({ length: 20 }, () => p.$queryRawUnsafe('SELECT 1::int AS ok')),
    );
    const org = await p.organization.count();
    console.log(JSON.stringify({ pgbouncer: true, concurrentSelects: rows.length, orgCount: org }));
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => {
  console.error('pgbouncer_test_fail', e.message);
  process.exit(1);
});
