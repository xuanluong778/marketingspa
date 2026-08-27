import { ApiError } from '@/lib/api-client';
import type { TranslateParams } from '@/i18n/types';

type TranslateFn = (key: string, params?: TranslateParams) => string;

/** Hiển thị message từ mutation error, gồm chi tiết validation nếu có */
export function formatMutationError(
  error: unknown,
  fallback = '',
  t?: TranslateFn,
): string {
  const tr = t ?? ((k: string) => k);
  if (!error) return fallback;
  if (error instanceof ApiError) {
    if (error.errors?.length) {
      return `${tr('validation.invalidData')}: ${error.errors.join(' · ')}`;
    }
    if (error.statusCode === 401) {
      return tr('validation.sessionExpired');
    }
    if (error.message === 'Validation failed' && error.statusCode === 400) {
      return fallback || tr('validation.validationFailed');
    }
    return error.message || fallback;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
