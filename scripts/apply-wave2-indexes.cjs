const { PrismaClient } = require('../packages/database/node_modules/@prisma/client');

async function main() {
  const p = new PrismaClient();
  try {
    await p.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS role_permissions_permission_id_idx ON role_permissions (permission_id)',
    );
    await p.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS auth_sessions_user_id_revoked_at_idx ON auth_sessions (user_id, revoked_at)',
    );
    console.log('indexes_ok');
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
