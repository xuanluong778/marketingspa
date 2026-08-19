import {
  CreateEmailIdentityCommand,
  GetEmailIdentityCommand,
  SESv2Client,
} from '@aws-sdk/client-sesv2';

function sesRegion() {
  return (process.env.AWS_REGION || process.env.SES_REGION || process.env.AWS_DEFAULT_REGION || 'ap-southeast-1').trim();
}

export function isSesIdentityConfigured(): boolean {
  return Boolean(
    sesRegion() &&
      ((process.env.AWS_ACCESS_KEY_ID || '').trim() || (process.env.AWS_PROFILE || '').trim()),
  );
}

function sesClient(): SESv2Client | null {
  if (!isSesIdentityConfigured()) return null;
  const accessKeyId = (process.env.AWS_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = (process.env.AWS_SECRET_ACCESS_KEY || '').trim();
  return new SESv2Client({
    region: sesRegion(),
    ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
  });
}

export type SesDomainIdentity = {
  tokens: string[];
  verificationStatus: string | null;
  dkimStatus: string | null;
};

function identityFrom(got: {
  DkimAttributes?: { Tokens?: string[]; Status?: string };
  VerificationStatus?: string;
}): SesDomainIdentity {
  return {
    tokens: (got.DkimAttributes?.Tokens ?? []).filter(Boolean),
    verificationStatus: got.VerificationStatus ?? null,
    dkimStatus: got.DkimAttributes?.Status ?? null,
  };
}

export async function provisionSesDomainIdentity(domain: string): Promise<SesDomainIdentity | null> {
  const client = sesClient();
  if (!client) return null;
  try {
    await client.send(new CreateEmailIdentityCommand({ EmailIdentity: domain }));
  } catch (err) {
    const name = (err as { name?: string })?.name || '';
    const message = err instanceof Error ? err.message : String(err);
    if (!/AlreadyExists|ConflictException|already exists/i.test(`${name} ${message}`)) {
      try {
        return await getSesDomainIdentity(domain);
      } catch {
        return null;
      }
    }
  }
  return getSesDomainIdentity(domain);
}

export async function getSesDomainIdentity(domain: string): Promise<SesDomainIdentity | null> {
  const client = sesClient();
  if (!client) return null;
  try {
    const got = await client.send(new GetEmailIdentityCommand({ EmailIdentity: domain }));
    return identityFrom(got);
  } catch {
    return null;
  }
}

export function sesDkimCnameRecords(domain: string, tokens: string[]) {
  return tokens.map((token) => ({
    host: `${token}._domainkey`,
    value: `${token}.dkim.amazonses.com`,
    fqdn: `${token}._domainkey.${domain}`,
  }));
}
