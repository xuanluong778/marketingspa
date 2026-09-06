/**
 * Meta OAuth — 3 flow tách biệt (Fanpage / Messenger / Ads).
 * Scopes lấy từ Graph call thật trong codebase, không phỏng đoán.
 */

export type MetaOAuthFlow = 'fanpage' | 'messenger' | 'ads';

/** A. Fanpage / Auto Post — Content Studio */
export const META_FANPAGE_OAUTH_SCOPES = [
  'public_profile',
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
] as const;

/** B. Messenger / Chatbot */
export const META_MESSENGER_OAUTH_SCOPES = [
  'pages_show_list',
  'pages_messaging',
  'pages_manage_metadata',
] as const;

/** C. Facebook Ads — chỉ scopes có Graph call production thật. */
export const META_ADS_OAUTH_SCOPES = ['ads_read', 'ads_management'] as const;

/** Chưa có flow production — không request trong OAuth. */
export const META_ADS_DEFERRED_SCOPES = ['business_management'] as const;

export type MetaOAuthFeatureTrace = {
  feature: string;
  graphEndpoint: string;
  requiredPermission: string;
  flow: MetaOAuthFlow;
};

/** Trace Graph thật — dùng cho audit App Review. */
export const META_OAUTH_FEATURE_GRAPH: MetaOAuthFeatureTrace[] = [
  // Fanpage / Auto Post
  {
    feature: 'Fanpage OAuth page picker',
    graphEndpoint: 'GET /me/accounts',
    requiredPermission: 'pages_show_list',
    flow: 'fanpage',
  },
  {
    feature: 'Fanpage details sync',
    graphEndpoint: 'GET /{page-id}?fields=...',
    requiredPermission: 'pages_read_engagement',
    flow: 'fanpage',
  },
  {
    feature: 'Fanpage recent posts',
    graphEndpoint: 'GET /{page-id}/published_posts',
    requiredPermission: 'pages_read_engagement',
    flow: 'fanpage',
  },
  {
    feature: 'Auto Post publish text/link',
    graphEndpoint: 'POST /{page-id}/feed',
    requiredPermission: 'pages_manage_posts',
    flow: 'fanpage',
  },
  {
    feature: 'Auto Post publish image',
    graphEndpoint: 'POST /{page-id}/photos',
    requiredPermission: 'pages_manage_posts',
    flow: 'fanpage',
  },
  // Messenger / Chatbot
  {
    feature: 'Messenger page list',
    graphEndpoint: 'GET /me/accounts',
    requiredPermission: 'pages_show_list',
    flow: 'messenger',
  },
  {
    feature: 'CSKH send message',
    graphEndpoint: 'POST /{page-id}/messages',
    requiredPermission: 'pages_messaging',
    flow: 'messenger',
  },
  {
    feature: 'CSKH webhook subscribe',
    graphEndpoint: 'POST /{page-id}/subscribed_apps',
    requiredPermission: 'pages_manage_metadata',
    flow: 'messenger',
  },
  {
    feature: 'Inbox conversations',
    graphEndpoint: 'GET /{page-id}/conversations',
    requiredPermission: 'pages_messaging',
    flow: 'messenger',
  },
  // Facebook Ads
  {
    feature: 'Ads account picker',
    graphEndpoint: 'GET /me/adaccounts',
    requiredPermission: 'ads_read',
    flow: 'ads',
  },
  {
    feature: 'Campaign insights',
    graphEndpoint: 'GET /act_{id}/insights',
    requiredPermission: 'ads_read',
    flow: 'ads',
  },
  {
    feature: 'Campaign pause/resume',
    graphEndpoint: 'POST /{campaign-id}',
    requiredPermission: 'ads_management',
    flow: 'ads',
  },
];

const FLOW_SCOPES: Record<MetaOAuthFlow, readonly string[]> = {
  fanpage: META_FANPAGE_OAUTH_SCOPES,
  messenger: META_MESSENGER_OAUTH_SCOPES,
  ads: META_ADS_OAUTH_SCOPES,
};

export function scopesForMetaOAuthFlow(flow: MetaOAuthFlow): readonly string[] {
  return FLOW_SCOPES[flow];
}

/** Scopes không thuộc flow — dùng gate NO_CROSS_FLOW_OVERREQUEST. */
export function findCrossFlowScopes(
  flow: MetaOAuthFlow,
  scopes: string[],
): string[] {
  const allowed = new Set<string>(FLOW_SCOPES[flow]);
  return scopes.filter((s) => s.trim() && !allowed.has(s.trim()));
}

/** Fanpage Login Config — backward compat META_LOGIN_CONFIG_ID. */
export function resolveMetaFanpageLoginConfigId(
  getEnv: (key: string) => string | undefined,
): string | undefined {
  const raw =
    getEnv('META_FANPAGE_LOGIN_CONFIG_ID')?.trim() ||
    getEnv('META_LOGIN_CONFIG_ID')?.trim() ||
    getEnv('FACEBOOK_LOGIN_CONFIG_ID')?.trim() ||
    getEnv('FACEBOOK_CONFIG_ID')?.trim();
  return raw || undefined;
}

/** Messenger Login Config — tạo riêng trên Meta Dashboard. */
export function resolveMetaMessengerLoginConfigId(
  getEnv: (key: string) => string | undefined,
): string | undefined {
  return getEnv('META_MESSENGER_LOGIN_CONFIG_ID')?.trim() || undefined;
}

/** Ads Login Config — tuỳ chọn; không có thì dùng scope= OAuth chuẩn. */
export function resolveMetaAdsLoginConfigId(
  getEnv: (key: string) => string | undefined,
): string | undefined {
  return getEnv('META_ADS_LOGIN_CONFIG_ID')?.trim() || undefined;
}

export function resolveMetaLoginConfigIdForFlow(
  flow: MetaOAuthFlow,
  getEnv: (key: string) => string | undefined,
): string | undefined {
  switch (flow) {
    case 'fanpage':
      return resolveMetaFanpageLoginConfigId(getEnv);
    case 'messenger':
      return resolveMetaMessengerLoginConfigId(getEnv);
    case 'ads':
      return resolveMetaAdsLoginConfigId(getEnv);
  }
}

export type MetaLoginConfigStatus =
  | { status: 'CONFIGURED'; configId: string }
  | { status: 'MANUAL_META_ACTION_REQUIRED'; feature: MetaOAuthFlow; message: string };

export function resolveMetaLoginConfigStatus(
  flow: MetaOAuthFlow,
  getEnv: (key: string) => string | undefined,
): MetaLoginConfigStatus {
  const configId = resolveMetaLoginConfigIdForFlow(flow, getEnv);
  if (configId) {
    return { status: 'CONFIGURED', configId };
  }
  if (flow === 'ads') {
    // Ads có thể OAuth bằng scope= không cần Login Configuration.
    return {
      status: 'MANUAL_META_ACTION_REQUIRED',
      feature: 'ads',
      message:
        'META_ADS_LOGIN_CONFIG_ID chưa có — khuyến nghị tạo Login Configuration riêng trên Meta Dashboard. ' +
        'Fallback: OAuth scope= (ads_read,ads_management).',
    };
  }
  const envKey =
    flow === 'fanpage' ? 'META_FANPAGE_LOGIN_CONFIG_ID' : 'META_MESSENGER_LOGIN_CONFIG_ID';
  return {
    status: 'MANUAL_META_ACTION_REQUIRED',
    feature: flow,
    message: `${envKey} (hoặc alias legacy) chưa cấu hình — tạo Login Configuration trên Meta Dashboard.`,
  };
}
