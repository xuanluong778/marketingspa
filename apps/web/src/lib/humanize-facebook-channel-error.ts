/**
 * Humanize Facebook channel errors for USER (FE).
 * Matches backend auto-post-user-facing-errors.ts codes — UI copy only.
 */

import type { TranslateParams } from '@/i18n/types';

type TFn = (key: string, params?: TranslateParams) => string;

function errorKeyFromMessage(message: string | null | undefined): string {
  if (!message?.trim()) return 'facebookFlow.errors.generic';
  const m = message.trim().toLowerCase();

  if (
    m.includes('missing_permission') ||
    m.includes('pages_manage') ||
    m.includes('pages_show') ||
    m.includes('pages_read') ||
    m.includes('chưa cấp quyền') ||
    m.includes('thiếu quyền')
  ) {
    return 'facebookFlow.errors.missingPermission';
  }
  if (
    m.includes('needs_reconnect') ||
    m.includes('token') ||
    m.includes('hết hạn') ||
    m.includes('thu hồi') ||
    m.includes('expired') ||
    m.includes('revoked')
  ) {
    return 'facebookFlow.errors.reconnect';
  }
  if (
    m.includes('oauth') ||
    m.includes('server_env') ||
    m.includes('allowlist') ||
    m.includes('config_id') ||
    m.includes('canary') ||
    m.includes('webhook') ||
    m.includes('meta_app') ||
    m.includes('restart api')
  ) {
    if (m.includes('server_env') || m.includes('allowlist')) {
      return 'facebookFlow.errors.adminOnly';
    }
    if (m.includes('canary') || m.includes('chưa bật') || m.includes('config')) {
      return 'facebookFlow.errors.notReady';
    }
  }
  if (m.includes('graph api') || m.includes('meta api') || m.includes('meta_api')) {
    return 'facebookFlow.errors.graphUnavailable';
  }
  return 'facebookFlow.errors.generic';
}

export function humanizeFacebookChannelError(
  message: string | null | undefined,
  t: TFn,
): string {
  return t(errorKeyFromMessage(message));
}

export function humanizeOAuthPagesStatus(
  status: string | undefined,
  t: TFn,
  message?: string | null,
): string {
  switch (status) {
    case 'MISSING_PERMISSION':
      return t('facebookFlow.errors.missingPermission');
    case 'TOKEN_EXPIRED':
      return t('facebookFlow.errors.reconnect');
    case 'NO_PENDING_OAUTH':
      return t('facebookFlow.errors.noPendingOauth');
    case 'NO_PAGES':
      return t('facebookFlow.errors.noPages');
    case 'META_API_ERROR':
      return t('facebookFlow.errors.metaApi');
    default:
      return humanizeFacebookChannelError(message, t);
  }
}
