import type {
  FanpageDetailsErrorCode,
  FanpageDetailsPage,
  FanpageDetailsPost,
} from './auto-post-facebook-page-details.types';

export const MISSING_READ_ENGAGEMENT_MESSAGE =
  'Fanpage chưa cấp quyền đọc thông tin (pages_read_engagement). Vui lòng kết nối lại Facebook và cấp đủ quyền.';

export const PERMISSION_DECLINED_MESSAGE =
  'Bạn đã từ chối quyền pages_read_engagement trên Facebook. Vui lòng Kết nối lại và chấp nhận quyền này.';

type MetaErrorLike = {
  message?: string;
  code?: number;
  type?: string;
  error_subcode?: number;
};

/**
 * Phân loại lỗi Meta Graph — không gom mọi lỗi thành “chưa cấp quyền đọc thông tin”.
 * Không log token.
 */
export function classifyMetaGraphError(err: MetaErrorLike | null | undefined): {
  code: FanpageDetailsErrorCode;
  message: string;
  httpStatus: number;
} {
  const msg = String(err?.message ?? '').trim();
  const lower = msg.toLowerCase();
  const code = err?.code;
  const sub = err?.error_subcode;

  if (
    code === 4 ||
    code === 17 ||
    code === 32 ||
    code === 613 ||
    lower.includes('rate limit') ||
    lower.includes('user request limit') ||
    lower.includes('too many calls')
  ) {
    return {
      code: 'rate_limited',
      message: 'Facebook đang giới hạn tạm thời. Vui lòng thử lại sau vài phút.',
      httpStatus: 429,
    };
  }

  if (
    code === 190 ||
    sub === 463 ||
    sub === 467 ||
    lower.includes('session has expired') ||
    lower.includes('access token has expired') ||
    lower.includes('error validating access token') ||
    lower.includes('token has expired')
  ) {
    return {
      code: 'expired_token',
      message: 'Token Facebook đã hết hạn. Vui lòng kết nối lại Facebook.',
      httpStatus: 401,
    };
  }

  if (
    lower.includes('invalid oauth access token') ||
    lower.includes('cannot parse access token') ||
    lower.includes('malformed access token') ||
    (code === 190 && lower.includes('invalid'))
  ) {
    return {
      code: 'invalid_page_token',
      message: 'Page Access Token không hợp lệ. Vui lòng làm mới Fanpage hoặc kết nối lại Facebook.',
      httpStatus: 401,
    };
  }

  // Declined — chỉ khi Meta nói rõ declined / user denied
  if (
    lower.includes('permission declined') ||
    lower.includes('user denied') ||
    (lower.includes('has not authorized') && lower.includes('declined'))
  ) {
    return {
      code: 'permission_declined',
      message: PERMISSION_DECLINED_MESSAGE,
      httpStatus: 403,
    };
  }

  // Chỉ map permission_missing khi chắc chắn liên quan pages_read_engagement
  if (
    lower.includes('pages_read_engagement') ||
    (lower.includes('(#10)') && lower.includes('engagement')) ||
    (code === 10 && lower.includes('pages_read_engagement')) ||
    (code === 200 && lower.includes('pages_read_engagement'))
  ) {
    return {
      code: 'permission_missing',
      message: MISSING_READ_ENGAGEMENT_MESSAGE,
      httpStatus: 403,
    };
  }

  // Wrong page / object không tồn tại / không thuộc token
  if (
    (code === 100 &&
      (lower.includes('does not exist') ||
        lower.includes('unsupported get request') ||
        lower.includes('nonexisting field') ||
        lower.includes('object with id'))) ||
    lower.includes('page id is not valid') ||
    lower.includes('was not found')
  ) {
    return {
      code: 'wrong_page_id',
      message:
        'Không tìm thấy Fanpage với Page ID này trên kết nối hiện tại (sai Page ID hoặc đã mất quyền quản trị).',
      httpStatus: 403,
    };
  }

  // Quyền khác (không phải pages_read_engagement) — giữ message Meta, không gán “chưa cấp quyền đọc”
  if (code === 10 || code === 200 || code === 294) {
    const safe = msg.slice(0, 280) || 'Facebook từ chối yêu cầu do thiếu quyền hoặc hạn chế đối tượng.';
    return {
      code: 'META_API_ERROR',
      message: safe,
      httpStatus: 403,
    };
  }

  if (
    lower.includes('fetch failed') ||
    lower.includes('econnreset') ||
    lower.includes('etimedout') ||
    lower.includes('network') ||
    lower.includes('enotfound') ||
    lower.includes('abort')
  ) {
    return {
      code: 'NETWORK_ERROR',
      message: 'Không kết nối được tới Facebook. Vui lòng thử lại.',
      httpStatus: 503,
    };
  }

  return {
    code: 'META_API_ERROR',
    message: msg.slice(0, 280) || 'Không thể đọc thông tin Fanpage từ Facebook lúc này.',
    httpStatus: 502,
  };
}

/** Map mã mới → alias FE cũ (nếu cần). */
export function toLegacyErrorCode(code: FanpageDetailsErrorCode): FanpageDetailsErrorCode {
  switch (code) {
    case 'permission_missing':
      return 'MISSING_PAGES_READ_ENGAGEMENT';
    case 'expired_token':
      return 'TOKEN_EXPIRED';
    case 'wrong_page_id':
    case 'invalid_page_token':
      return 'PAGE_ACCESS_REVOKED';
    case 'rate_limited':
      return 'META_RATE_LIMIT';
    default:
      return code;
  }
}

export function buildPermissionsFlags(scopes: string[]): {
  pages_show_list: boolean;
  pages_read_engagement: boolean;
  pages_manage_posts: boolean;
} {
  const set = new Set(scopes.map((s) => s.trim()).filter(Boolean));
  const isEnv = set.has('env_page_token');
  return {
    pages_show_list: isEnv || set.has('pages_show_list'),
    pages_read_engagement: isEnv || set.has('pages_read_engagement'),
    pages_manage_posts: isEnv || set.has('pages_manage_posts'),
  };
}

export function hasPagesReadEngagement(scopes: string[]): boolean {
  return buildPermissionsFlags(scopes).pages_read_engagement;
}

/**
 * Gộp scopes DB + live — không thu hẹp quyền đã lưu trừ khi Meta báo declined tường minh.
 */
export function mergeConnectionScopes(
  stored: string[],
  liveGranted: string[],
  liveDeclined: string[] = [],
): string[] {
  const declined = new Set(liveDeclined.map((s) => s.trim()).filter(Boolean));
  const merged = new Set<string>();
  for (const s of [...stored, ...liveGranted]) {
    const t = String(s ?? '').trim();
    if (!t || declined.has(t)) continue;
    merged.add(t);
  }
  return [...merged];
}

/**
 * Fields an toàn cho /published_posts|/posts.
 * Tránh likes/comments/reactions.summary — Meta hay trả (#10) pages_read_engagement
 * / pages_read_user_content dù /me/permissions đã granted (Standard Access / thiếu Advanced).
 */
export const FANPAGE_DETAILS_PAGE_FIELDS = [
  'id',
  'name',
  'about',
  'category',
  'description',
  'website',
  'link',
  'username',
  'phone',
  'emails',
  'fan_count',
  'followers_count',
  'picture.width(200).height(200){url}',
  'cover{source}',
  'location{city,country,street}',
] as const;

export const FANPAGE_DETAILS_SAFE_POST_FIELDS = [
  'id',
  'message',
  'story',
  'created_time',
  'permalink_url',
  'full_picture',
  'shares',
  'attachments{media_type,type,url,media}',
] as const;

type RawPage = {
  id?: string;
  name?: string;
  about?: string;
  category?: string;
  description?: string;
  website?: string;
  link?: string;
  username?: string;
  phone?: string;
  emails?: string[];
  fan_count?: number;
  followers_count?: number;
  picture?: { data?: { url?: string }; url?: string };
  cover?: { source?: string };
  location?: { city?: string; country?: string; street?: string };
};

type RawPost = {
  id?: string;
  message?: string;
  story?: string;
  created_time?: string;
  permalink_url?: string;
  full_picture?: string;
  shares?: { count?: number };
  likes?: { summary?: { total_count?: number } };
  comments?: { summary?: { total_count?: number } };
  reactions?: { summary?: { total_count?: number } };
  attachments?: {
    data?: Array<{
      media_type?: string;
      type?: string;
      url?: string;
      media?: { image?: { src?: string } };
    }>;
  };
};

function numOrNull(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
}

function strOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
}

export function mapMetaPageToDetails(
  raw: RawPage,
  local: { id: string; pageId: string; pageName: string; pagePictureUrl: string | null },
): FanpageDetailsPage {
  const pictureUrl =
    strOrNull(raw.picture?.data?.url) ??
    strOrNull(raw.picture?.url) ??
    local.pagePictureUrl;

  const loc = raw.location;
  const location = loc
    ? [loc.street, loc.city, loc.country].map((p) => strOrNull(p)).filter(Boolean).join(', ') ||
      null
    : null;
  const emails = Array.isArray(raw.emails)
    ? raw.emails.map((e) => String(e).trim()).filter(Boolean)
    : null;

  return {
    id: local.id,
    pageId: strOrNull(raw.id) ?? local.pageId,
    name: strOrNull(raw.name) ?? local.pageName,
    pictureUrl,
    coverUrl: strOrNull(raw.cover?.source),
    category: strOrNull(raw.category),
    about: strOrNull(raw.about),
    description: strOrNull(raw.description),
    website: strOrNull(raw.website),
    link: strOrNull(raw.link),
    username: strOrNull(raw.username),
    phone: strOrNull(raw.phone),
    emails: emails && emails.length ? emails : null,
    location,
    followersCount: numOrNull(raw.followers_count),
    fanCount: numOrNull(raw.fan_count),
  };
}

export function mapMetaPostToDetails(raw: RawPost): FanpageDetailsPost | null {
  const id = strOrNull(raw.id);
  if (!id) return null;

  const attachment = raw.attachments?.data?.[0];
  const thumb =
    strOrNull(raw.full_picture) ??
    strOrNull(attachment?.media?.image?.src) ??
    null;
  const mediaType =
    strOrNull(attachment?.media_type) ?? strOrNull(attachment?.type) ?? (thumb ? 'photo' : null);

  const likes = numOrNull(raw.likes?.summary?.total_count);
  const reactions = numOrNull(raw.reactions?.summary?.total_count);

  return {
    id,
    message: strOrNull(raw.message) ?? strOrNull(raw.story),
    createdTime: strOrNull(raw.created_time),
    permalinkUrl: strOrNull(raw.permalink_url),
    thumbnailUrl: thumb,
    mediaType,
    likes,
    comments: numOrNull(raw.comments?.summary?.total_count),
    shares: numOrNull(raw.shares?.count),
    reactions: reactions ?? likes,
  };
}

export function mapMetaPosts(rawList: RawPost[] | undefined, limit: number): FanpageDetailsPost[] {
  if (!Array.isArray(rawList)) return [];
  const out: FanpageDetailsPost[] = [];
  for (const row of rawList) {
    if (out.length >= limit) break;
    const mapped = mapMetaPostToDetails(row);
    if (mapped) out.push(mapped);
  }
  return out;
}

/** Cache key an toàn — không chứa token. */
export function fanpageDetailsCacheKey(organizationId: string, fanpageId: string): string {
  return `${organizationId}:${fanpageId}`;
}

export const FANPAGE_SYNC_TIMEZONE = 'Asia/Ho_Chi_Minh';

/** HH:mm DD/MM/YYYY theo Asia/Ho_Chi_Minh — không fake timezone. */
export function formatHoChiMinhDateTime(input: Date | string | null | undefined): string | null {
  if (input == null) return null;
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: FANPAGE_SYNC_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour12: false,
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  const hour = get('hour');
  const minute = get('minute');
  const day = get('day');
  const month = get('month');
  const year = get('year');
  if (!hour || !minute || !day || !month || !year) return null;
  return `${hour}:${minute} ${day}/${month}/${year}`;
}

export function snapshotHasTokenLeak(value: unknown): boolean {
  const s = JSON.stringify(value);
  return (
    /encryptedPageAccessToken|access_token/i.test(s) ||
    /\b(?:EAAG|EAAD|EAA)[A-Za-z0-9_-]{20,}\b/.test(s)
  );
}
