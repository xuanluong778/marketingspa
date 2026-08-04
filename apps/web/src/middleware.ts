import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const COOKIE_HTTP = 'msa_ref';
const COOKIE_JS = 'msa_ref_js';
const MAX_AGE = 30 * 24 * 60 * 60; // 30 days

/** Lưu ?ref=CODE cookie 30 ngày (HttpOnly + JS mirror) — SameSite=Lax, Secure trên HTTPS */
export function middleware(request: NextRequest) {
  const ref = request.nextUrl.searchParams.get('ref')?.trim().toUpperCase();
  const res = NextResponse.next();
  if (ref && /^[A-Z0-9]{4,32}$/.test(ref)) {
    const secure = request.nextUrl.protocol === 'https:';
    const host = request.nextUrl.hostname;
    // Host-only cookie cho apex; thêm Domain=.example.com nếu vào qua www
    const cookieDomain = host.startsWith('www.') ? `.${host.slice(4)}` : undefined;
    const common = {
      sameSite: 'lax' as const,
      secure,
      path: '/',
      maxAge: MAX_AGE,
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    };
    res.cookies.set(COOKIE_HTTP, ref, { ...common, httpOnly: true });
    // Mirror đọc được từ JS / gửi X-Affiliate-Ref khi HttpOnly không tới API
    res.cookies.set(COOKIE_JS, ref, { ...common, httpOnly: false });
  }
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
};
