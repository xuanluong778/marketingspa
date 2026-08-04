import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { sign } from 'jsonwebtoken';

const env: Record<string, string> = {};
for (const line of readFileSync(join(__dirname, '../.env'), 'utf8').split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#') || !t.includes('=')) continue;
  const i = t.indexOf('=');
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}

async function main() {
  const prisma = new PrismaClient();
  const admin = await prisma.user.findFirst({
    where: { role: { code: 'SUPER_ADMIN' } },
    include: { role: true },
  });
  if (!admin) throw new Error('no admin');
  const token = sign(
    {
      sub: admin.id,
      email: admin.email,
      organizationId: admin.organizationId,
      role: admin.role!.code,
    },
    env.JWT_SECRET!,
    { expiresIn: '10m' },
  );
  const res = await fetch(
    `${env.API_INTERNAL_URL || 'http://127.0.0.1:4000/api/v1'}/auto-post/facebook/oauth/start`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const j: any = await res.json();
  const fb =
    j.url ||
    j.redirectUrl ||
    j.authorizationUrl ||
    j.facebookUrl ||
    j.oauthUrl ||
    j.data?.url ||
    '';
  const m = String(fb).match(/https?:\/\/[^\s"']+/);
  const parsed = m ? new URL(m[0]) : null;
  const scope = parsed?.searchParams.get('scope') || '';
  const configId = parsed?.searchParams.get('config_id') || '';
  const redirectUri = parsed?.searchParams.get('redirect_uri') || '';
  const out = {
    http: res.status,
    keys: Object.keys(j),
    has_facebook_host: Boolean(parsed?.hostname.includes('facebook.com')),
    has_scope_param: Boolean(scope),
    scope_value_safe: scope ? scope.replace(/[^a-z_,]/gi, '') : null,
    scope_has_pages: /pages_show_list|pages_manage_posts|pages_read_engagement/.test(scope),
    has_config_id: Boolean(configId),
    redirect_host: redirectUri ? new URL(redirectUri).host : null,
  };
  console.log(JSON.stringify(out, null, 2));
  if (out.scope_has_pages) process.exit(2);
  if (!out.has_config_id) process.exit(3);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
