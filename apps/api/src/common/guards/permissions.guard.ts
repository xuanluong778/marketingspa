import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import type { AuthUser } from '../interfaces/auth-user.interface';
import { SYSTEM_ROLES } from '../constants/roles';

@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const request = context.switchToHttp().getRequest<{ user?: AuthUser; method?: string; url?: string }>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Không có thông tin người dùng');
    }

    if (user.role === SYSTEM_ROLES.OWNER) {
      return true;
    }

    const permissions = user.permissions ?? [];
    const missing = required.filter((p) => !permissions.includes(p));
    const enforce = process.env.HRM_PERMISSIONS_ENFORCE !== 'false';

    if (missing.length === 0) return true;

    if (!enforce) {
      this.logger.warn(
        `[shadow] thiếu quyền [${missing.join(', ')}] user=${user.email} ${request.method} ${request.url}`,
      );
      return true;
    }

    throw new ForbiddenException(`Thiếu quyền: ${missing.join(', ')}`);
  }
}
