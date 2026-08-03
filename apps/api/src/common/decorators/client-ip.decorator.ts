import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** IP client từ request (x-forwarded-for / socket) */
export const ClientIp = createParamDecorator((_data: unknown, ctx: ExecutionContext): string | undefined => {
  const request = ctx.switchToHttp().getRequest<{
    headers?: Record<string, string | string[] | undefined>;
    ip?: string;
    socket?: { remoteAddress?: string };
  }>();
  const forwarded = request.headers?.['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (raw) return raw.split(',')[0]?.trim();
  return request.ip ?? request.socket?.remoteAddress;
});
