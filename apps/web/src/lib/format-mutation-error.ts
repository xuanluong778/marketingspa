import { ApiError } from '@/lib/api-client';

/** Hiển thị message từ mutation error, gồm chi tiết validation nếu có */
export function formatMutationError(error: unknown, fallback = ''): string {
  if (!error) return fallback;
  if (error instanceof ApiError) {
    if (error.errors?.length) {
      return error.errors.join(' · ');
    }
    if (error.message === 'Validation failed' && error.statusCode === 400) {
      return 'Dữ liệu không hợp lệ — thử tải lại trang hoặc restart API backend';
    }
    return error.message || fallback;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
