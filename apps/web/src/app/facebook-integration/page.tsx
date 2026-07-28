import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Facebook,
  ChevronRight,
  Mail,
  Phone,
  MapPin,
  ShieldCheck,
  Unplug,
  Trash2,
  Lock,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BrandLogo } from '@/components/brand/brand-logo';

const SITE_URL = 'https://marketingautoaz.com';
const CONTACT_EMAIL = 'thegioimarketingdigi@gmail.com';
const CONTACT_PHONE = '0934 077 360';
const CONTACT_ADDRESS = '134/93 Lý Chính Thắng, Phường Xuân Hòa, Thành phố Hồ Chí Minh, Việt Nam';
const PAGE_PATH = '/facebook-integration';
const PAGE_URL = `${SITE_URL}${PAGE_PATH}`;

export const metadata: Metadata = {
  title: 'Facebook Integration | MarketingAutoAZ',
  description:
    'MarketingAutoAZ Facebook Fanpage integration for Meta Access Verification. Users connect via Facebook Login for Business, grant permissions intentionally, and can revoke access anytime. Operated by CONG TY TNHH THE GIOI DIGI.',
  alternates: {
    canonical: PAGE_URL,
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: 'Facebook Integration | MarketingAutoAZ',
    description:
      'How MarketingAutoAZ connects Facebook Fanpages via Facebook Login for Business — data use, encryption, disconnect, and data deletion.',
    url: PAGE_URL,
    siteName: 'MarketingAutoAZ',
    type: 'website',
    locale: 'vi_VN',
    alternateLocale: ['en_US'],
    images: [
      { url: `${SITE_URL}/brand/logo.png`, width: 1024, height: 1024, alt: 'MarketingAutoAZ' },
    ],
  },
};

const sections = [
  { id: 'overview', title: 'Tổng quan / Overview' },
  { id: 'how-it-works', title: 'Cách hoạt động / How it works' },
  { id: 'data-use', title: 'Sử dụng dữ liệu / Data use' },
  { id: 'security', title: 'Bảo mật token / Token security' },
  { id: 'disconnect', title: 'Ngắt kết nối / Disconnect' },
  { id: 'data-deletion', title: 'Yêu cầu xóa dữ liệu / Data deletion' },
  { id: 'company', title: 'Thông tin doanh nghiệp / Company' },
];

export default function FacebookIntegrationPage() {
  return (
    <div className="min-h-screen bg-background text-foreground scroll-smooth">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto flex items-center justify-between py-4 px-4 sm:px-6">
          <BrandLogo size={32} wordmark="MarketingAutoAZ" wordmarkClassName="text-xl" />
          <div className="flex items-center gap-3 sm:gap-4">
            <Link
              href="/privacy-policy"
              className="hidden sm:inline text-sm font-medium text-muted-foreground hover:text-white transition-colors"
            >
              Privacy
            </Link>
            <Link
              href="/"
              className="text-sm font-medium text-muted-foreground hover:text-white transition-colors"
            >
              Trang chủ
            </Link>
            <Button
              variant="outline"
              className="border-white/20 bg-transparent text-white hover:bg-white/10"
              asChild
            >
              <Link href="/login">Đăng nhập</Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="border-b border-white/5 bg-gradient-to-b from-[#1A6B52]/30 to-transparent py-12 md:py-16">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#F97316] mb-3">
            <Facebook className="h-4 w-4" />
            Meta Access Verification
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl md:text-5xl">
            Facebook Integration
          </h1>
          <p className="mt-4 text-base text-muted-foreground max-w-3xl">
            Trang công khai mô tả cách MarketingAutoAZ kết nối Facebook Fanpage — phục vụ Meta App
            Review / Access Verification.
            <br />
            <span className="text-white/70">
              Public page describing how MarketingAutoAZ connects Facebook Fanpages — for Meta App
              Review / Access Verification.
            </span>
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span>
              Đơn vị vận hành / Operator: <strong>CÔNG TY TNHH THẾ GIỚI DIGI</strong>
            </span>
            <span className="hidden sm:inline">•</span>
            <span>
              Website:{' '}
              <a href={SITE_URL} className="text-[#F97316] hover:underline">
                marketingautoaz.com
              </a>
            </span>
            <span className="hidden sm:inline">•</span>
            <span>Cập nhật / Updated: 28/07/2026</span>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 py-10 md:py-14">
        <div className="grid gap-10 lg:grid-cols-[240px_1fr]">
          <aside className="hidden lg:block">
            <nav className="sticky top-24 space-y-1 text-sm">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Mục lục / Contents
              </p>
              {sections.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-muted-foreground hover:bg-white/5 hover:text-white transition-colors"
                >
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#F97316]" />
                  <span>{s.title}</span>
                </a>
              ))}
            </nav>
          </aside>

          <main className="prose prose-invert max-w-none space-y-12 text-sm sm:text-base leading-relaxed text-muted-foreground">
            <section id="overview" className="scroll-mt-24 space-y-4">
              <h2 className="text-xl font-bold text-white border-b border-white/10 pb-2">
                1. Tổng quan / Overview
              </h2>
              <p>
                <strong className="text-white">MarketingAutoAZ</strong> là nền tảng SaaS giúp doanh
                nghiệp kết nối và quản lý Facebook Fanpage: đăng bài, lên lịch nội dung và vận hành
                các kênh đã chọn trong một workspace.
              </p>
              <p>
                <strong className="text-white">MarketingAutoAZ</strong> is a SaaS platform that
                helps businesses connect and manage Facebook Fanpages: publish posts, schedule
                content, and operate selected channels in one workspace.
              </p>
            </section>

            <section id="how-it-works" className="scroll-mt-24 space-y-4">
              <h2 className="text-xl font-bold text-white border-b border-white/10 pb-2">
                2. Cách hoạt động / How it works
              </h2>
              <ul className="list-disc space-y-3 pl-5">
                <li>
                  Người dùng tự đăng nhập bằng{' '}
                  <strong className="text-white">Facebook Login for Business</strong> và chủ động
                  cấp quyền trên màn hình Meta.
                  <br />
                  <span className="text-white/60">
                    Users sign in with Facebook Login for Business and intentionally grant
                    permissions on Meta&apos;s consent screen.
                  </span>
                </li>
                <li>
                  Hệ thống chỉ dùng dữ liệu được cấp phép để xác định tài khoản, liệt kê Fanpage
                  người dùng quản trị, đăng / lên lịch nội dung và quản lý các Fanpage đã chọn.
                  <br />
                  <span className="text-white/60">
                    The system only uses permitted data to identify the account, list managed
                    Fanpages, publish / schedule content, and manage the Fanpages the user selected.
                  </span>
                </li>
                <li>
                  Người dùng chọn Fanpage muốn kết nối; MarketingAutoAZ không tự ý kết nối Page mà
                  người dùng không chọn.
                  <br />
                  <span className="text-white/60">
                    Users choose which Fanpages to connect; MarketingAutoAZ does not connect Pages
                    the user did not select.
                  </span>
                </li>
              </ul>
            </section>

            <section id="data-use" className="scroll-mt-24 space-y-4">
              <h2 className="text-xl font-bold text-white border-b border-white/10 pb-2">
                3. Sử dụng dữ liệu / Data use
              </h2>
              <div className="rounded-lg border border-white/10 bg-card p-5 sm:p-6 space-y-3 not-prose">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="h-5 w-5 text-[#F97316] shrink-0 mt-0.5" />
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p>
                      Chúng tôi cam kết{' '}
                      <strong className="text-white">không bán, cho thuê hoặc chia sẻ</strong> dữ
                      liệu Facebook đã được cấp phép vì mục đích quảng cáo hoặc thương mại riêng. Dữ
                      liệu chỉ được cung cấp hạn chế cho đơn vị xử lý cần thiết để vận hành dịch vụ,
                      hoặc theo yêu cầu pháp luật.
                    </p>
                    <p className="text-white/60">
                      We do <strong className="text-white">not sell, rent, or share</strong>{' '}
                      permitted Facebook data for advertising or our own commercial purposes. Data
                      is disclosed only to necessary processors that operate the service, or when
                      required by law.
                    </p>
                  </div>
                </div>
              </div>
              <p>
                Chi tiết thêm tại{' '}
                <Link href="/privacy-policy" className="text-[#F97316] hover:underline">
                  Chính sách bảo mật / Privacy Policy
                </Link>{' '}
                và{' '}
                <Link href="/terms" className="text-[#F97316] hover:underline">
                  Điều khoản dịch vụ / Terms
                </Link>
                .
              </p>
            </section>

            <section id="security" className="scroll-mt-24 space-y-4">
              <h2 className="text-xl font-bold text-white border-b border-white/10 pb-2">
                4. Bảo mật access token / Access token security
              </h2>
              <div className="rounded-lg border border-white/10 bg-card p-5 sm:p-6 space-y-3 not-prose">
                <div className="flex items-start gap-3">
                  <Lock className="h-5 w-5 text-[#F97316] shrink-0 mt-0.5" />
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p>
                      Access token được <strong className="text-white">mã hóa khi lưu trữ</strong>{' '}
                      trên máy chủ. Token{' '}
                      <strong className="text-white">tuyệt đối không hiển thị</strong> trên frontend
                      (giao diện người dùng).
                    </p>
                    <p className="text-white/60">
                      Access tokens are <strong className="text-white">encrypted at rest</strong> on
                      the server. Tokens are <strong className="text-white">never displayed</strong>{' '}
                      on the frontend (user interface).
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section id="disconnect" className="scroll-mt-24 space-y-4">
              <h2 className="text-xl font-bold text-white border-b border-white/10 pb-2">
                5. Cách ngắt kết nối Facebook / How to disconnect Facebook
              </h2>
              <div className="rounded-lg border border-white/10 bg-card p-5 sm:p-6 space-y-4 not-prose">
                <div className="flex items-start gap-3">
                  <Unplug className="h-5 w-5 text-[#F97316] shrink-0 mt-0.5" />
                  <div className="space-y-3 text-sm text-muted-foreground">
                    <p className="font-medium text-white">Trong MarketingAutoAZ / In the app</p>
                    <ol className="list-decimal space-y-2 pl-5">
                      <li>
                        Đăng nhập MarketingAutoAZ → vào{' '}
                        <Link
                          href="/content?tab=channels"
                          className="text-[#F97316] hover:underline"
                        >
                          Content &amp; Auto post → Kết nối kênh
                        </Link>{' '}
                        (<span className="text-white/50">/content?tab=channels</span>) → chọn
                        Fanpage → bấm <strong className="text-white">Ngắt kết nối</strong>.
                      </li>
                      <li className="text-white/60">
                        Sign in to MarketingAutoAZ → open Content &amp; Auto post → Connected
                        channels (/content?tab=channels) → select a Fanpage → Disconnect.
                      </li>
                    </ol>
                    <p className="pt-2 font-medium text-white">
                      Hoặc trên Facebook / Or on Facebook
                    </p>
                    <ol className="list-decimal space-y-2 pl-5">
                      <li>
                        Vào Facebook → <strong className="text-white">Cài đặt</strong> →{' '}
                        <strong className="text-white">Ứng dụng và trang web</strong> →{' '}
                        <strong className="text-white">MarketingAutoAZ</strong> →{' '}
                        <strong className="text-white">Gỡ</strong>.
                      </li>
                      <li className="text-white/60">
                        Go to Facebook → Settings → Apps and websites → MarketingAutoAZ → Remove.
                      </li>
                    </ol>
                    <p>
                      Người dùng có thể ngắt từng Fanpage trong ứng dụng hoặc thu hồi toàn bộ quyền
                      truy cập trên Facebook.
                      <br />
                      <span className="text-white/60">
                        Users can disconnect individual Fanpages in the app or revoke all access on
                        Facebook.
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section id="data-deletion" className="scroll-mt-24 space-y-4">
              <h2 className="text-xl font-bold text-white border-b border-white/10 pb-2">
                6. Yêu cầu xóa dữ liệu / Data deletion request
              </h2>
              <div className="rounded-lg border border-white/10 bg-card p-5 sm:p-6 space-y-4 not-prose">
                <div className="flex items-start gap-3">
                  <Trash2 className="h-5 w-5 text-[#F97316] shrink-0 mt-0.5" />
                  <div className="space-y-3 text-sm text-muted-foreground">
                    <p>
                      Để yêu cầu xóa dữ liệu liên quan đến kết nối Facebook, vui lòng làm theo hướng
                      dẫn tại trang xóa dữ liệu hoặc gửi email hỗ trợ.
                      <br />
                      <span className="text-white/60">
                        To request deletion of Facebook-related data, follow the data deletion
                        instructions page or email support.
                      </span>
                    </p>
                    <ul className="list-disc space-y-2 pl-5">
                      <li>
                        Trang hướng dẫn / Instructions:{' '}
                        <Link
                          href="/data-deletion"
                          className="text-[#F97316] hover:underline inline-flex items-center gap-1"
                        >
                          /data-deletion
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </li>
                      <li>
                        Email hỗ trợ / Support email:{' '}
                        <a
                          href={`mailto:${CONTACT_EMAIL}?subject=Data%20Deletion%20Request%20-%20MarketingAutoAZ`}
                          className="text-[#F97316] hover:underline"
                        >
                          {CONTACT_EMAIL}
                        </a>
                      </li>
                    </ul>
                    <p className="text-xs text-white/50">
                      Trong email, vui lòng ghi rõ tên tài khoản MarketingAutoAZ, Fanpage ID (nếu
                      có) và mô tả dữ liệu cần xóa. / Please include your MarketingAutoAZ account
                      name, Fanpage ID (if any), and a description of the data to delete.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section id="company" className="scroll-mt-24 space-y-4">
              <h2 className="text-xl font-bold text-white border-b border-white/10 pb-2">
                7. Thông tin doanh nghiệp / Company information
              </h2>
              <div className="rounded-lg border border-white/10 bg-card p-6 space-y-4 not-prose">
                <h3 className="font-semibold text-lg text-white">CÔNG TY TNHH THẾ GIỚI DIGI</h3>
                <p className="text-sm text-muted-foreground">
                  Sản phẩm / Product: <strong className="text-white">MarketingAutoAZ</strong>
                </p>
                <div className="space-y-2 text-muted-foreground text-xs sm:text-sm">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-[#F97316] shrink-0" />
                    <span>
                      Email:{' '}
                      <a
                        href={`mailto:${CONTACT_EMAIL}`}
                        className="text-[#F97316] hover:underline"
                      >
                        {CONTACT_EMAIL}
                      </a>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-[#F97316] shrink-0" />
                    <span>
                      Điện thoại / Phone:{' '}
                      <a href={`tel:${CONTACT_PHONE.replace(/\s/g, '')}`}>{CONTACT_PHONE}</a>
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-[#F97316] shrink-0 mt-0.5" />
                    <span>
                      Địa chỉ / Address:{' '}
                      <strong className="text-white/90">{CONTACT_ADDRESS}</strong>
                      <br />
                      Website:{' '}
                      <a href={SITE_URL} className="text-[#F97316] hover:underline">
                        marketingautoaz.com
                      </a>
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 pt-2 text-sm">
                  <Link href="/privacy-policy" className="text-[#F97316] hover:underline">
                    /privacy-policy
                  </Link>
                  <Link href="/terms" className="text-[#F97316] hover:underline">
                    /terms
                  </Link>
                  <Link href="/data-deletion" className="text-[#F97316] hover:underline">
                    /data-deletion
                  </Link>
                </div>
              </div>
            </section>
          </main>
        </div>
      </div>

      <footer className="border-t border-white/10 bg-black/20 py-8 text-xs text-muted-foreground mt-10">
        <div className="container mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            &copy; 2026 <strong>CÔNG TY TNHH THẾ GIỚI DIGI</strong>. Bảo lưu mọi quyền lợi.
          </div>
          <div className="flex flex-wrap gap-4 sm:gap-6">
            <Link href="/" className="hover:text-white transition-colors">
              Trang chủ
            </Link>
            <Link href="/privacy-policy" className="hover:text-white transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-white transition-colors">
              Terms
            </Link>
            <Link href="/data-deletion" className="hover:text-white transition-colors">
              Data Deletion
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
