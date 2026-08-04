import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';

export const REFRESH_COOKIE_NAME = 'ms_refresh_token';

export function refreshCookieOptions(config: ConfigService) {
  const secure =
    config.get<string>('NODE_ENV') === 'production' ||
    config.get<string>('COOKIE_SECURE') === 'true';
  const sameSite = (config.get<string>('COOKIE_SAME_SITE') ?? 'lax') as
    | 'lax'
    | 'strict'
    | 'none';
  const domain = config.get<string>('COOKIE_DOMAIN')?.trim() || undefined;
  const maxAgeDays = parseInt(config.get<string>('JWT_REFRESH_EXPIRES_DAYS', '7'), 10);
  return {
    httpOnly: true,
    secure,
    sameSite,
    domain,
    path: '/api/v1/auth',
    maxAge: maxAgeDays * 24 * 60 * 60 * 1000,
  };
}

export function setRefreshCookie(
  res: Response,
  token: string,
  config: ConfigService,
): void {
  res.cookie(REFRESH_COOKIE_NAME, token, refreshCookieOptions(config));
}

export function clearRefreshCookie(res: Response, config: ConfigService): void {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    ...refreshCookieOptions(config),
    maxAge: 0,
  });
}
