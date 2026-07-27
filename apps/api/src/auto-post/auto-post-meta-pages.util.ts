/** Quyền Pages tối thiểu cho OAuth Fanpage (Login for Business Configuration). */
export const AUTO_POST_REQUIRED_PAGE_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
] as const;

export type AutoPostRequiredPageScope = (typeof AUTO_POST_REQUIRED_PAGE_SCOPES)[number];

export type OAuthPagesStatus =
  | 'OK'
  | 'MISSING_PERMISSION'
  | 'NO_PAGES'
  | 'TOKEN_EXPIRED'
  | 'NO_PENDING_OAUTH'
  | 'META_API_ERROR';

export interface MetaPageAccountParsed {
  id: string;
  name: string;
  access_token: string;
  picture?: { data?: { url?: string } };
  tasks: string[];
}

export interface OAuthPagesListResult {
  status: OAuthPagesStatus;
  facebookUserName: string | null;
  grantedScopes: string[];
  missingScopes: string[];
  requiredScopes: string[];
  pages: Array<{
    id: string;
    pageId: string;
    pageName: string;
    pagePictureUrl: string | null;
    tasks: string[];
    canManagePosts: boolean;
  }>;
  message: string | null;
}

type RawMetaPage = {
  id?: string;
  name?: string;
  access_token?: string;
  picture?: { data?: { url?: string }; url?: string };
  tasks?: string[];
};

type MetaAccountsResponse = {
  data?: RawMetaPage[];
  paging?: { next?: string };
  error?: { message?: string; code?: number; type?: string };
};

export function missingRequiredPageScopes(granted: string[]): string[] {
  const set = new Set(granted);
  return AUTO_POST_REQUIRED_PAGE_SCOPES.filter((s) => !set.has(s));
}

export function mergeGrantedScopes(
  fromPermissions: string[],
  fromDebugToken?: string[],
): string[] {
  return [...new Set([...fromPermissions, ...(fromDebugToken ?? [])].filter(Boolean))];
}

/** Parse Graph `/me/accounts` row — không loại Page theo Business Portfolio / New Pages Experience. */
export function parseMetaPageAccount(raw: RawMetaPage): MetaPageAccountParsed | null {
  const id = String(raw.id ?? '').trim();
  const name = String(raw.name ?? '').trim();
  if (!id || !name) return null;

  const pictureUrl = raw.picture?.data?.url ?? raw.picture?.url ?? null;
  const tasks = Array.isArray(raw.tasks)
    ? raw.tasks.map((t) => String(t)).filter(Boolean)
    : [];

  return {
    id,
    name,
    access_token: String(raw.access_token ?? ''),
    picture: pictureUrl ? { data: { url: pictureUrl } } : undefined,
    tasks,
  };
}

export function pageCanManagePosts(page: MetaPageAccountParsed): boolean {
  if (page.tasks.includes('CREATE_CONTENT') || page.tasks.includes('MANAGE')) {
    return true;
  }
  // Một số Page cũ không trả tasks — vẫn hiển thị nếu có access_token từ /me/accounts.
  return Boolean(page.access_token);
}

export function toOAuthPagesListItem(page: MetaPageAccountParsed) {
  return {
    id: page.id,
    pageId: page.id,
    pageName: page.name,
    pagePictureUrl: page.picture?.data?.url ?? null,
    tasks: page.tasks,
    canManagePosts: pageCanManagePosts(page),
  };
}

export async function fetchAllManagedPages(
  fetchPage: (url: string) => Promise<MetaAccountsResponse>,
  apiVersion: string,
): Promise<MetaPageAccountParsed[]> {
  const fields = 'id,name,access_token,picture{url},tasks';
  let nextUrl: string | null =
    `https://graph.facebook.com/${apiVersion}/me/accounts?fields=${encodeURIComponent(fields)}&limit=100`;
  const parsed: MetaPageAccountParsed[] = [];
  const seen = new Set<string>();

  while (nextUrl) {
    const body = await fetchPage(nextUrl);
    if (body.error) {
      throw new Error(body.error.message ?? 'Meta API error');
    }
    for (const row of body.data ?? []) {
      const page = parseMetaPageAccount(row);
      if (!page || seen.has(page.id)) continue;
      seen.add(page.id);
      parsed.push(page);
    }
    nextUrl = body.paging?.next ?? null;
  }

  return parsed;
}

export function buildOAuthPagesListResult(input: {
  status: OAuthPagesStatus;
  facebookUserName?: string | null;
  grantedScopes?: string[];
  missingScopes?: string[];
  pages?: MetaPageAccountParsed[];
  message?: string | null;
}): OAuthPagesListResult {
  return {
    status: input.status,
    facebookUserName: input.facebookUserName ?? null,
    grantedScopes: input.grantedScopes ?? [],
    missingScopes: input.missingScopes ?? [],
    requiredScopes: [...AUTO_POST_REQUIRED_PAGE_SCOPES],
    pages: (input.pages ?? []).map(toOAuthPagesListItem),
    message: input.message ?? null,
  };
}
