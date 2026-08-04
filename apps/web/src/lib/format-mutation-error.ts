import { ApiError } from '@/lib/api-client';

/** Hiển thị message từ mutation error, gồm chi tiết validation nếu có */
export function formatMutationError(error: unknown, fallback = ''): string {
  if (!error) return fallback;
  if (error instanceof ApiError) {
    if (error.errors?.length) {
      return `Dữ liệu không hợp lệ: ${error.errors.join(' · ')}`;
    }
    if (error.statusCode === 401) {
      return 'Phiên đăng nhập hết hạn. Vui lòng tải lại trang hoặc đăng nhập lại.';
    }
    if (error.message === 'Validation failed' && error.statusCode === 400) {
      return fallback || 'Dữ liệu gửi lên không hợp lệ (ValidationPipe). Kiểm tra lại các trường bắt buộc.';
    }
    return error.message || fallback;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
