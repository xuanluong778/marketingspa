import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { AuthUser } from '../interfaces/auth-user.interface';

/**
 * Multi-tenant guard — đảm bảo user chỉ truy cập dữ liệu organization của mình.
 * Kiểm tra organizationId từ JWT khớp với param/body/query nếu có.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      user?: AuthUser;
      params?: Record<string, string>;
      body?: Record<string, unknown>;
      query?: Record<string, string>;
    }>();

    const user = request.user;
    if (!user?.organizationId) {
      throw new ForbiddenException('Không xác định được organization');
    }

    const orgFromRequest =
      request.params?.organizationId ??
      request.body?.organizationId ??
      request.query?.organizationId;

    if (orgFromRequest && orgFromRequest !== user.organizationId) {
      throw new ForbiddenException('Không có quyền truy cập organization này');
    }

    return true;
  }
}
