import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const user = req?.user;
    if (user?.role === 'SUPER_ADMIN' || user?.platformRole === 'SUPER_ADMIN') {
      return true;
    }
    throw new ForbiddenException('Platform admin required');
  }
}
