import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { SKIP_SUBSCRIPTION_KEY } from '../common/decorators/skip-subscription.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { BillingService } from './billing.service';

/** Path prefix (sau global prefix api/v1) được mở khi đã login nhưng chưa có gói */
const ALLOW_PREFIXES = [
  '/auth',
  '/billing',
  '/payments',
  '/health',
  '/admin', // PlatformAdminGuard riêng; SUPER_ADMIN cũng bypass bên dưới
  '/organizations',
  '/affiliate/track',
  // Public webhooks / OAuth callback — không có user hoặc không cần gói
  '/chatbot-cskh/public',
  '/chatbot-cskh/facebook',
  '/messaging/webhooks',
  '/ad-performance/facebook/oauth',
  '/ad-performance/google/oauth',
];

function normalizePath(url: string): string {
  const path = (url || '').split('?')[0] || '';
  // req.url có thể là /api/v1/... hoặc /billing/...
  const stripped = path.replace(/^\/api\/v1/, '') || '/';
  return stripped.startsWith('/') ? stripped : `/${stripped}`;
}

@Injectable()
export class SubscriptionEntitlementInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly billing: BillingService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_SUBSCRIPTION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return next.handle();

    const req = context.switchToHttp().getRequest<{
      user?: AuthUser;
      url?: string;
      originalUrl?: string;
      path?: string;
      method?: string;
    }>();

    const user = req.user;
    // Public / chưa auth — JwtAuthGuard trên route sẽ chặn nếu cần
    if (!user?.organizationId) return next.handle();

    // Platform SUPER_ADMIN không bị khóa gói SaaS
    if (user.role === 'SUPER_ADMIN') return next.handle();

    const path = normalizePath(req.originalUrl || req.url || req.path || '');
    if (ALLOW_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
      return next.handle();
    }

    const ent = await this.billing.hasValidEntitlement(user.organizationId);
    if (!ent.ok) {
      const code =
        ent.reason === 'TRIAL_EXPIRED' ? 'TRIAL_EXPIRED' : 'SUBSCRIPTION_REQUIRED';
      const message =
        ent.reason === 'TRIAL_EXPIRED'
          ? 'Thời gian dùng thử đã kết thúc. Vui lòng thanh toán để tiếp tục sử dụng MarketingAutoAZ.'
          : ent.reason === 'EXPIRED'
            ? 'Gói đã hết hạn. Vui lòng gia hạn để tiếp tục sử dụng.'
            : 'Vui lòng thanh toán hoặc kích hoạt dùng thử để sử dụng tính năng này.';
      throw new ForbiddenException({
        statusCode: 403,
        code,
        message,
        subscriptionStatus: ent.reason,
        redirectTo: '/pricing',
      });
    }

    // Trial: chỉ cho phép prefix tính năng được cấu hình
    if (ent.isTrial) {
      const allowed = await this.billing.isFeatureAllowedForOrg(
        user.organizationId,
        path.replace(/^\//, ''),
      );
      if (!allowed) {
        throw new ForbiddenException({
          statusCode: 403,
          code: 'FEATURE_NOT_IN_TRIAL',
          message:
            'Tính năng này không nằm trong gói dùng thử. Vui lòng nâng cấp để sử dụng.',
          subscriptionStatus: 'TRIALING',
          redirectTo: '/pricing',
        });
      }
    }

    return next.handle();
  }
}
