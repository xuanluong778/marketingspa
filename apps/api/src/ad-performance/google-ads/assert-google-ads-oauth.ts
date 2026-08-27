import { BadRequestException } from '@nestjs/common';

/** Production callback — single source of truth for authorize + token exchange. */
export const MARKETINGAUTOAZ_GOOGLE_ADS_OAUTH_REDIRECT_URI =
  'https://marketingautoaz.com/api/v1/ad-performance/google/oauth/callback';

export function resolveGoogleAdsRedirectUri(
  get: (key: string) => string | undefined,
): string {
  const raw = get('GOOGLE_ADS_REDIRECT_URI')?.trim();
  if (!raw) {
    throw new BadRequestException('GOOGLE_ADS_REDIRECT_URI chưa cấu hình');
  }
  const uri = raw.replace(/\/+$/, '');
  if (!/^https:\/\//i.test(uri) && process.env.NODE_ENV === 'production') {
    throw new BadRequestException('GOOGLE_ADS_REDIRECT_URI phải dùng HTTPS trên production');
  }
  if (uri.includes('/ai-ads-manager/google/oauth/callback')) {
    throw new BadRequestException(
      'GOOGLE_ADS_REDIRECT_URI phải là /ad-performance/google/oauth/callback (callback handler thật)',
    );
  }
  const appUrl = (get('APP_URL') ?? '').replace(/\/+$/, '');
  if (
    process.env.NODE_ENV === 'production' &&
    appUrl.includes('marketingautoaz.com') &&
    uri !== MARKETINGAUTOAZ_GOOGLE_ADS_OAUTH_REDIRECT_URI
  ) {
    throw new BadRequestException(
      `GOOGLE_ADS_REDIRECT_URI production phải là ${MARKETINGAUTOAZ_GOOGLE_ADS_OAUTH_REDIRECT_URI}`,
    );
  }
  return uri;
}
