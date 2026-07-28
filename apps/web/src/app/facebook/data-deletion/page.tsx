import type { Metadata } from 'next';
import Link from 'next/link';
import { Trash2, ChevronRight, Mail, Phone, MapPin, ShieldCheck, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BrandLogo } from '@/components/brand/brand-logo';

export const metadata: Metadata = {
  title: 'Hướng dẫn xóa dữ liệu Facebook | MarketingAutoAZ',
  description:
    'Hướng dẫn xóa dữ liệu và thu hồi quyền truy cập ứng dụng MarketingAutoAZ trên Facebook/Meta. Quy trình xóa dữ liệu Fanpage, Messenger và token theo yêu cầu Meta.',
  alternates: {
    canonical: 'https://marketingautoaz.com/facebook/data-deletion',
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: 'Hướng dẫn xóa dữ liệu Facebook | MarketingAutoAZ',
    description:
      'Hướng dẫn xóa dữ liệu và thu hồi quyền truy cập ứng dụng MarketingAutoAZ trên Facebook/Meta.',
    url: 'https://marketingautoaz.com/facebook/data-deletion',
    siteName: 'MarketingAutoAZ',
    type: 'website',
    locale: 'vi_VN',
    images: [
      {
        url: 'https://marketingautoaz.com/brand/logo.png',
        width: 1024,
        height: 1024,
        alt: 'MarketingAutoAZ',
      },
    ],
  },
};

const sections = [
  { id: '1-tong-quan', title: '1. Tổng quan' },
  { id: '2-du-lieu-luu-tru', title: '2. Dữ liệu Facebook chúng tôi lưu' },
  { id: '3-tu-xoa-tren-meta', title: '3. Tự xóa quyền trên Meta' },
  { id: '4-yeu-cau-qua-email', title: '4. Yêu cầu xóa qua email' },
  { id: '5-xoa-trong-ung-dung', title: '5. Xóa trong ứng dụng' },
  { id: '6-thoi-gian-xu-ly', title: '6. Thời gian xử lý' },
  { id: '7-lien-he', title: '7. Liên hệ hỗ trợ' },
];

const CONTACT_EMAIL = 'thegioimarketingdigi@gmail.com';
const CONTACT_PHONE = '0934 077 360';
const CONTACT_ADDRESS = '134/93 Lý Chính Thắng, Phường Xuân Hòa, Thành phố Hồ Chí Minh, Việt Nam';

export default function FacebookDataDeletionPage() {
  return (
    <div className="min-h-screen bg-background text-foreground scroll-smooth">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto flex items-center justify-between py-4 px-4 sm:px-6">
          <BrandLogo size={32} wordmark="MarketingAutoAZ" wordmarkClassName="text-xl" />
          <div className="flex items-center gap-4">
            <Link
              href="/privacy"
              className="text-sm font-medium text-muted-foreground hover:text-white transition-colors hidden sm:inline"
            >
              Chính sách bảo mật
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
            <Trash2 className="h-4 w-4" />
            Meta · Data Deletion
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl md:text-5xl">
            Hướng dẫn xóa dữ liệu Facebook
          </h1>
          <p className="mt-4 text-base text-muted-foreground max-w-2xl">
            Trang này mô tả cách bạn (hoặc người dùng cuối) có thể yêu cầu xóa dữ liệu liên quan đến
            Facebook Fanpage / Messenger mà MarketingAutoAZ đã lưu khi bạn kết nối ứng dụng. Nội
            dung tuân thủ yêu cầu Data Deletion Instructions của Meta.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span>
              Đơn vị vận hành: <strong>CÔNG TY TNHH THẾ GIỚI DIGI</strong>
            </span>
            <span className="hidden sm:inline">•</span>
            <span>
              Website:{' '}
              <a href="https://marketingautoaz.com" className="text-[#F97316] hover:underline">
                marketingautoaz.com
              </a>
            </span>
            <span className="hidden sm:inline">•</span>
            <span>Cập nhật: 26/07/2026</span>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 py-10 md:py-14">
        <div className="grid gap-10 lg:grid-cols-[240px_1fr]">
          <aside className="hidden lg:block">
            <nav className="sticky top-24 space-y-1 text-sm">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Mục lục
              </p>
              {sections.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="flex items-center gap-1 rounded-md px-2 py-1.5 text-muted-foreground hover:bg-white/5 hover:text-white transition-colors"
                >
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" />
                  <span>{s.title}</span>
                </a>
              ))}
            </nav>
          </aside>

          <main className="prose prose-invert max-w-none space-y-10 text-sm leading-relaxed text-muted-foreground">
            <section id="1-tong-quan" className="scroll-mt-24 space-y-4">
              <h2 className="text-xl font-bold text-white border-b border-white/10 pb-2">
                1. Tổng quan
              </h2>
              <p>
                Khi bạn kết nối Fanpage / Messenger với MarketingAutoAZ, hệ thống có thể lưu một số
                thông tin cần thiết để vận hành chatbot CSKH, nhắn tin và tự động hóa marketing. Bạn
                có quyền yêu cầu xóa các dữ liệu này bất kỳ lúc nào.
              </p>
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 flex gap-3 text-emerald-100">
                <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-400" />
                <p className="m-0 text-sm">
                  Trang này là <strong>Data Deletion Instructions URL</strong> chính thức dùng khi
                  khai báo Meta App (Facebook Login / Messenger / Pages). Không cần đăng nhập để
                  xem.
                </p>
              </div>
            </section>

            <section id="2-du-lieu-luu-tru" className="scroll-mt-24 space-y-4">
              <h2 className="text-xl font-bold text-white border-b border-white/10 pb-2">
                2. Dữ liệu Facebook chúng tôi có thể lưu
              </h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>Page ID, tên Fanpage và trạng thái kết nối.</li>
                <li>Page Access Token đã mã hóa (không lưu plaintext trên UI).</li>
                <li>
                  Khi bạn bật Chatbot CSKH / nhắn tin: PSID, hội thoại Messenger, nội dung tin nhắn
                  chatbot và metadata liên quan đến chăm sóc khách hàng.
                </li>
                <li>
                  Thông tin lead / danh tính liên kết (khi chatbot thu thập hoặc bạn đồng bộ vào
                  CRM).
                </li>
              </ul>
              <p>
                Chi tiết đầy đủ về thu thập và xử lý dữ liệu xem tại{' '}
                <Link href="/privacy" className="text-[#F97316] hover:underline">
                  Chính sách bảo mật
                </Link>
                .
              </p>
            </section>

            <section id="3-tu-xoa-tren-meta" className="scroll-mt-24 space-y-4">
              <h2 className="text-xl font-bold text-white border-b border-white/10 pb-2">
                3. Tự xóa / thu hồi quyền truy cập trên Meta
              </h2>
              <p>Bạn có thể tự gỡ quyền ứng dụng ngay trên Facebook:</p>
              <ol className="list-decimal pl-5 space-y-2">
                <li>
                  Mở{' '}
                  <a
                    href="https://www.facebook.com/settings?tab=applications"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#F97316] hover:underline inline-flex items-center gap-1"
                  >
                    Cài đặt Facebook → Ứng dụng và trang web
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  .
                </li>
                <li>
                  Tìm ứng dụng <strong>MarketingAutoAZ</strong> (hoặc tên App Meta tương ứng).
                </li>
                <li>
                  Chọn <strong>Xóa</strong> / <strong>Gỡ</strong> để thu hồi quyền truy cập.
                </li>
                <li>
                  Sau khi gỡ quyền, hãy gửi email yêu cầu xóa dữ liệu đã lưu trên máy chủ của chúng
                  tôi (mục 4) để hoàn tất.
                </li>
              </ol>
            </section>

            <section id="4-yeu-cau-qua-email" className="scroll-mt-24 space-y-4">
              <h2 className="text-xl font-bold text-white border-b border-white/10 pb-2">
                4. Yêu cầu xóa dữ liệu qua email
              </h2>
              <p>Gửi email tới địa chỉ hỗ trợ với tiêu đề và nội dung gợi ý như sau:</p>
              <div className="rounded-lg border border-white/10 bg-card p-5 space-y-3 not-prose">
                <p className="text-xs text-muted-foreground">Gửi tới</p>
                <p className="text-white font-medium">
                  <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#F97316] hover:underline">
                    {CONTACT_EMAIL}
                  </a>
                </p>
                <p className="text-xs text-muted-foreground mt-3">Tiêu đề gợi ý</p>
                <p className="text-white text-sm">
                  [Xóa dữ liệu Facebook] — MarketingAutoAZ — [Email tài khoản của bạn]
                </p>
                <p className="text-xs text-muted-foreground mt-3">Nội dung cần có</p>
                <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                  <li>Email / số điện thoại đăng ký trên MarketingAutoAZ</li>
                  <li>Page ID hoặc tên Fanpage cần xóa liên kết</li>
                  <li>
                    Xác nhận: “Tôi yêu cầu xóa toàn bộ dữ liệu Facebook liên kết với tài khoản”
                  </li>
                </ul>
              </div>
            </section>

            <section id="5-xoa-trong-ung-dung" className="scroll-mt-24 space-y-4">
              <h2 className="text-xl font-bold text-white border-b border-white/10 pb-2">
                5. Xóa / ngắt kết nối trong ứng dụng
              </h2>
              <ol className="list-decimal pl-5 space-y-2">
                <li>
                  Đăng nhập{' '}
                  <Link href="/login" className="text-[#F97316] hover:underline">
                    marketingautoaz.com
                  </Link>
                  .
                </li>
                <li>
                  Vào{' '}
                  <Link href="/content?tab=channels" className="text-[#F97316] hover:underline">
                    Content &amp; Auto post → Kết nối kênh
                  </Link>{' '}
                  (<code className="text-white/70">/content?tab=channels</code>) → chọn Fanpage →
                  bấm <strong>Ngắt kết nối</strong>.
                </li>
                <li>
                  Token và bản ghi kết nối Fanpage sẽ được gỡ khỏi tổ chức của bạn. Bạn vẫn có thể
                  gửi email (mục 4) nếu muốn xóa thêm lịch sử hội thoại / lead liên quan.
                </li>
                <li>
                  Hoặc trên Facebook: <strong>Cài đặt</strong> →{' '}
                  <strong>Ứng dụng và trang web</strong> → <strong>MarketingAutoAZ</strong> →{' '}
                  <strong>Gỡ</strong> để thu hồi toàn bộ quyền truy cập.
                </li>
              </ol>
            </section>

            <section id="6-thoi-gian-xu-ly" className="scroll-mt-24 space-y-4">
              <h2 className="text-xl font-bold text-white border-b border-white/10 pb-2">
                6. Thời gian xử lý & xác nhận
              </h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  Sau khi nhận yêu cầu hợp lệ, chúng tôi xử lý trong vòng{' '}
                  <strong className="text-white">72 giờ làm việc</strong>.
                </li>
                <li>
                  Dữ liệu bị xóa gồm: liên kết Fanpage, token đã mã hóa, và (theo yêu cầu) hội thoại
                  Messenger / lead gắn với Page đó.
                </li>
                <li>
                  Chúng tôi có thể giữ lại bản ghi tối thiểu phục vụ nghĩa vụ pháp lý / chống gian
                  lận theo{' '}
                  <Link href="/privacy" className="text-[#F97316] hover:underline">
                    Chính sách bảo mật
                  </Link>{' '}
                  và{' '}
                  <Link href="/terms" className="text-[#F97316] hover:underline">
                    Điều khoản dịch vụ
                  </Link>
                  .
                </li>
                <li>
                  Bạn sẽ nhận email xác nhận khi yêu cầu đã hoàn tất (nếu cung cấp địa chỉ liên hệ).
                </li>
              </ul>
            </section>

            <section id="7-lien-he" className="scroll-mt-24 space-y-4">
              <h2 className="text-xl font-bold text-white border-b border-white/10 pb-2">
                7. Thông tin liên hệ
              </h2>
              <div className="rounded-lg border border-white/10 bg-card p-6 space-y-4 not-prose">
                <h3 className="font-semibold text-lg text-white">CÔNG TY TNHH THẾ GIỚI DIGI</h3>
                <div className="space-y-2 text-muted-foreground text-xs">
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
                      Điện thoại:{' '}
                      <a href={`tel:${CONTACT_PHONE.replace(/\s/g, '')}`}>{CONTACT_PHONE}</a>
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-[#F97316] shrink-0 mt-0.5" />
                    <span>
                      Địa chỉ: <strong>{CONTACT_ADDRESS}</strong>
                      <br />
                      Website:{' '}
                      <a
                        href="https://marketingautoaz.com"
                        className="text-[#F97316] hover:underline"
                      >
                        marketingautoaz.com
                      </a>
                    </span>
                  </div>
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
            <Link href="/privacy" className="hover:text-white transition-colors">
              Chính sách bảo mật
            </Link>
            <Link href="/terms" className="hover:text-white transition-colors">
              Điều khoản dịch vụ
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
