import { Resolver } from 'node:dns/promises';

export type DomainDnsPurpose = 'DKIM' | 'SPF' | 'DMARC';

export type DomainDnsRecord = {
  key: string;
  purpose: DomainDnsPurpose;
  title: string;
  hint: string;
  type: 'CNAME' | 'TXT';
  host: string;
  value: string;
};

export type DkimCname = { host: string; value: string };

const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

export function normalizeSenderDomain(input: string): string {
  let value = input.trim().toLowerCase();
  value = value.replace(/^https?:\/\//, '');
  value = value.replace(/\/.*$/, '');
  value = value.replace(/:\d+$/, '');
  value = value.replace(/\.$/, '');
  value = value.replace(/^www\./, '');
  return value;
}

export function isValidSenderDomain(domain: string): boolean {
  return DOMAIN_RE.test(domain) && domain.length <= 253;
}

export function fromEmailMatchesDomain(email: string, domain: string): boolean {
  const host = email.split('@')[1]?.toLowerCase() || '';
  return host === domain;
}

export function defaultSpfValue(): string {
  return 'v=spf1 include:amazonses.com ~all';
}

export function defaultDmarcValue(): string {
  return 'v=DMARC1; p=none;';
}

export function buildDomainDnsRecords(input: {
  domain: string;
  dkimRecords?: DkimCname[];
  spfValue?: string | null;
  dmarcValue?: string | null;
}): DomainDnsRecord[] {
  const domain = input.domain;
  const records: DomainDnsRecord[] = [];
  const dkims = input.dkimRecords?.length
    ? input.dkimRecords
    : [];
  dkims.forEach((row, i) => {
    records.push({
      key: `dkim-${i + 1}`,
      purpose: 'DKIM',
      title: dkims.length > 1 ? `Chữ ký email (DKIM) ${i + 1}/${dkims.length}` : 'Chữ ký email (DKIM)',
      hint: 'Giúp hộp thư nhận biết email do bạn gửi, không phải giả mạo.',
      type: 'CNAME',
      host: row.host,
      value: row.value,
    });
  });
  records.push({
    key: 'spf',
    purpose: 'SPF',
    title: 'Cho phép gửi email (SPF)',
    hint: 'Nếu tên miền đã có SPF, hãy thêm include:amazonses.com vào bản ghi đó — không tạo SPF thứ hai.',
    type: 'TXT',
    host: '@',
    value: input.spfValue || defaultSpfValue(),
  });
  records.push({
    key: 'dmarc',
    purpose: 'DMARC',
    title: 'Bảo vệ thương hiệu (DMARC)',
    hint: 'Bắt đầu với p=none là an toàn. Có thể nhờ kỹ thuật viên siết sau.',
    type: 'TXT',
    host: '_dmarc',
    value: input.dmarcValue || defaultDmarcValue(),
  });
  return records;
}

function normalizeLookupName(value: string): string {
  return value.replace(/\.$/, '').toLowerCase();
}

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function publicResolver(): Resolver {
  const resolver = new Resolver();
  resolver.setServers(['8.8.8.8', '1.1.1.1']);
  return resolver;
}

export async function lookupTxt(name: string): Promise<string[]> {
  const resolver = publicResolver();
  try {
    const rows = await withTimeout(resolver.resolveTxt(name), 5000, [] as string[][]);
    return rows.map((parts) => parts.join('').replace(/^"|"$/g, '').trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export async function lookupCname(name: string): Promise<string[]> {
  const resolver = publicResolver();
  try {
    const rows = await withTimeout(resolver.resolveCname(name), 5000, [] as string[]);
    return rows.map(normalizeLookupName).filter(Boolean);
  } catch {
    return [];
  }
}

export function spfAllowsSes(txtRecords: string[]): boolean {
  return txtRecords.some((txt) => {
    const lower = txt.toLowerCase();
    return lower.startsWith('v=spf1') && lower.includes('include:amazonses.com');
  });
}

export function hasDmarc(txtRecords: string[]): boolean {
  return txtRecords.some((txt) => txt.toLowerCase().includes('v=dmarc1'));
}

export async function checkDomainDns(input: {
  domain: string;
  dkimRecords: DkimCname[];
}): Promise<{ dkim: boolean; spf: boolean; dmarc: boolean }> {
  const domain = input.domain;
  const txt = await lookupTxt(domain);
  const dmarcTxt = await lookupTxt(`_dmarc.${domain}`);
  const dkimOk =
    input.dkimRecords.length > 0 &&
    (
      await Promise.all(
        input.dkimRecords.map(async (row) => {
          const fqdn = row.host.includes(domain) ? row.host : `${row.host}.${domain}`;
          const found = await lookupCname(fqdn);
          return found.includes(normalizeLookupName(row.value));
        }),
      )
    ).every(Boolean);

  return {
    dkim: dkimOk,
    spf: spfAllowsSes(txt),
    dmarc: hasDmarc(dmarcTxt),
  };
}
