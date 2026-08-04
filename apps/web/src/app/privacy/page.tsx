import type { Metadata } from 'next';
import Link from 'next/link';
import { Shield, ChevronRight, Mail, Phone, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BrandLogo } from '@/components/brand/brand-logo';

const SITE_URL = 'https://marketingautoaz.com';
const CONTACT_EMAIL = 'thegioimarketingdigi@gmail.com';
const CONTACT_PHONE = '0934 077 360';
const CONTACT_ADDRESS = '134/93 Lý Chính Thắng, Phường Xuân Hòa, Thành phố Hồ Chí Minh, Việt Nam';

export const metadata: Metadata = {
  title: 'Chính sách bảo mật | MarketingAutoAZ',
  description:
    'Chính sách bảo mật thông tin khách hàng và dữ liệu liên kết trên hệ thống MarketingAutoAZ - Vận hành bởi CÔNG TY TNHH THẾ GIỚI DIGI. Cam kết an toàn và minh bạch dữ liệu.',
  alternates: {
    canonical: `${SITE_URL}/privacy`,
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: 'Chính sách bảo mật | MarketingAutoAZ',
    description:
      'Chính sách bảo mật thông tin khách hàng và dữ liệu liên kết trên hệ thống MarketingAutoAZ - Vận hành bởi CÔNG TY TNHH THẾ GIỚI DIGI.',
    url: `${SITE_URL}/privacy`,
    siteName: 'MarketingAutoAZ',
    type: 'website',
    locale: 'vi_VN',
    images: [
      { url: `${SITE_URL}/brand/logo.png`, width: 1024, height: 1024, alt: 'MarketingAutoAZ' },
    ],
  },
};

const sections = [
  { id: '1-thu-thap-du-lieu', title: '1. Dữ liệu chúng tôi thu thập' },
  { id: '2-su-dung-thong-tin', title: '2. Cách thức sử dụng thông tin' },
  { id: '3-bao-mat-ma-hoa', title: '3. Bảo mật & Mã hóa dữ liệu' },
  { id: '4-tich-hop-ben-thu-ba', title: '4. Tích hợp bên thứ ba' },
  { id: '5-chia-se-du-lieu', title: '5. Chia sẻ dữ liệu' },
  { id: '6-chinh-sach-cookie', title: '6. Chính sách Cookie' },
  { id: '7-quyen-nguoi-dung', title: '7. Quyền của người dùng' },
  { id: '8-yeu-cau-xoa-du-lieu', title: '8. Yêu cầu xóa dữ liệu' },
  { id: '9-thay-doi-chinh-sach', title: '9. Thay đổi chính sách' },
  { id: '10-thong-tin-lien-he', title: '10. Thông tin liên hệ' },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground scroll-smooth">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto flex items-center justify-between py-4 px-4 sm:px-6">
          <BrandLogo size={32} wordmark="MarketingAutoAZ" wordmarkClassName="text-xl" />
          <div className="flex items-center gap-4">
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

      {/* Main Hero Section */}
      <div className="border-b border-white/5 bg-gradient-to-b from-[#1A6B52]/30 to-transparent py-12 md:py-16">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#F97316] mb-3">
            <Shield className="h-4 w-4" />
            An toàn dữ liệu
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl md:text-5xl">
            Chính sách bảo mật
          </h1>
          <p className="mt-4 text-base text-muted-foreground max-w-2xl">
            Sự riêng tư và an toàn dữ liệu của bạn là trách nhiệm hàng đầu của chúng tôi. Hãy đọc kỹ
            Chính sách bảo mật này để biết cách chúng tôi thu thập, sử dụng và bảo mật thông tin của
            bạn.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span>
              Đơn vị vận hành: <strong>CÔNG TY TNHH THẾ GIỚI DIGI</strong>
            </span>
            <span className="hidden sm:inline">•</span>
            <span>
              Cập nhật gần nhất: <strong>26 tháng 07, 2026</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Content Section */}
      <div className="container mx-auto px-4 py-12 sm:px-6">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-4">
          {/* Sidebar - Sticky Table of Contents */}
          <aside className="lg:col-span-1 lg:sticky lg:top-24 lg:h-[fit-content] max-h-[80vh] overflow-y-auto pr-2 scrollbar-thin">
            <h2 className="text-sm font-bold uppercase tracking-wider text-white mb-4">
              Mục lục điều hướng
            </h2>
            <nav className="space-y-1">
              {sections.map((sec) => (
                <a
                  key={sec.id}
                  href={`#${sec.id}`}
                  className="group flex items-center justify-between rounded-md px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-white/5 hover:text-white transition-all duration-200"
                >
                  <span className="truncate">{sec.title}</span>
                  <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-[#F97316]" />
                </a>
              ))}
            </nav>
          </aside>

          {/* Document Content */}
          <main className="lg:col-span-3 space-y-12 text-sm leading-relaxed text-white/90">
            {/* Section 1 */}
            <section id="1-thu-thap-du-lieu" className="scroll-mt-24 space-y-4">
              <h2 className="text-xl font-bold text-white border-b border-white/10 pb-2">
                1. Dữ liệu chúng tôi thu thập
              </h2>
              <p>
                Để cung cấp dịch vụ quản lý và tự động hóa marketing tốt nhất, MarketingAutoAZ thu
                thập các loại dữ liệu sau đây:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>Thông tin đăng ký tài khoản:</strong> Họ và tên, địa chỉ email, số điện
                  thoại, mật khẩu đăng nhập và thông tin về doanh nghiệp/tổ chức (Spa/Thẩm mỹ viện)
                  của bạn.
                </li>
                <li>
                  <strong>Mã thông báo kết nối (Tokens):</strong> Mã truy cập API (Access Tokens)
                  của các kênh liên kết như Facebook Fanpage, Messenger, Zalo OA, WordPress hoặc
                  Google Ad Account được bạn chủ động tích hợp vào hệ thống. Token được mã hóa
                  AES-256-GCM khi lưu; không hiển thị trên giao diện hay URL trình duyệt.
                </li>
                <li>
                  <strong>Dữ liệu Facebook Fanpage (sau khi bạn cấp quyền):</strong> Page ID, tên
                  Fanpage, ảnh đại diện (picture URL), quyền/tasks Meta trả về, và Page Access Token
                  đã mã hóa — chỉ với các Page bạn chọn kết nối. Quyền Meta{' '}
                  <code className="text-white/80">pages_show_list</code> được dùng để liệt kê
                  Fanpage bạn quản lý (Graph <code className="text-white/80">/me/accounts</code>),
                  không dùng để tìm hoặc gắn Page bạn không quản trị.
                </li>
                <li>
                  <strong>Thông tin khách hàng & Lead:</strong> Dữ liệu về thông tin liên hệ của
                  khách hàng, lịch hẹn, trạng thái chăm sóc (CRM) do người dùng tải lên hoặc đồng bộ
                  tự động từ các chiến dịch quảng cáo nhằm quản lý trong phạm vi Tổ chức
                  (Organization) của bạn.
                </li>
                <li>
                  <strong>Dữ liệu thiết bị & Sử dụng:</strong> Địa chỉ IP, loại trình duyệt, hệ điều
                  hành, dấu vân tay thiết bị (device fingerprint) và nhật ký thao tác trên hệ thống
                  để phục vụ mục đích bảo mật và tối ưu trải nghiệm.
                </li>
              </ul>
            </section>

            {/* Section 2 */}
            <section id="2-su-dung-thong-tin" className="scroll-mt-24 space-y-4">
              <h2 className="text-xl font-bold text-white border-b border-white/10 pb-2">
                2. Cách thức sử dụng thông tin thu thập
              </h2>
              <p>
                Dữ liệu thu thập được sử dụng duy nhất cho các mục đích vận hành dịch vụ, bao gồm:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  Xác thực danh tính, phân quyền tài khoản và duy trì cấu hình bảo mật theo từng Tổ
                  chức (Organization).
                </li>
                <li>
                  Vận hành công cụ Content AI để sinh nội dung tiếp thị cá nhân hóa theo thông tin
                  Spa và khách hàng của bạn.
                </li>
                <li>
                  Thực hiện đăng bài viết tự động lên Facebook Fanpage hoặc gửi tin nhắn hàng loạt
                  theo lịch hẹn và kịch bản tự động hóa (qua Messenger, Zalo OA, ZBS) theo đúng yêu
                  cầu từ bạn.
                </li>
                <li>
                  Gửi thông báo về biến động số dư tài khoản, giao dịch thanh toán và thông tin bảo
                  trì hệ thống.
                </li>
                <li>
                  Phát hiện, ngăn chặn các hành vi gian lận tài khoản, lạm dụng chương trình dùng
                  thử (Trial abuse) hoặc các cuộc tấn công kỹ thuật phá hoại hệ thống.
                </li>
              </ul>
            </section>

            {/* Section 3 */}
            <section id="3-bao-mat-ma-hoa" className="scroll-mt-24 space-y-4">
              <h2 className="text-xl font-bold text-white border-b border-white/10 pb-2">
                3. Bảo mật và mã hóa dữ liệu nhạy cảm
              </h2>
              <p>
                Chúng tôi áp dụng các tiêu chuẩn an ninh thông tin nghiêm ngặt để bảo vệ dữ liệu của
                bạn trước các nguy cơ truy cập trái phép, sửa đổi hoặc tiêu hủy trái phép:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>Mã hóa lưu trữ:</strong> Toàn bộ các mã thông báo kết nối API nhạy cảm của
                  bên thứ ba (Meta Access Tokens, Zalo Tokens) được mã hóa bằng thuật toán đối xứng
                  mạnh <strong>AES-256-GCM</strong> trước khi lưu vào cơ sở dữ liệu. Khóa mật mã
                  được lưu trữ độc lập và bảo mật nghiêm ngặt.
                </li>
                <li>
                  <strong>Mã hóa truyền tải:</strong> Mọi thông tin truyền đi giữa trình duyệt của
                  bạn và hệ thống đều được bắt buộc mã hóa qua giao thức an toàn HTTPS (SSL/TLS).
                </li>
                <li>
                  <strong>Cô lập dữ liệu:</strong> Toàn bộ cơ sở dữ liệu nghiệp vụ đều được gắn nhãn
                  mã tổ chức (Organization ID) để cách ly hoàn toàn dữ liệu giữa các doanh nghiệp sử
                  dụng chung hệ thống.
                </li>
              </ul>
            </section>

            {/* Section 4 */}
            <section id="4-tich-hop-ben-thu-ba" className="scroll-mt-24 space-y-4">
              <h2 className="text-xl font-bold text-white border-b border-white/10 pb-2">
                4. Tích hợp và truyền nhận dữ liệu với nền tảng bên thứ ba
              </h2>
              <p>
                MarketingAutoAZ cung cấp các cổng kết nối đến các nền tảng lớn để tự động hóa quy
                trình làm việc. Bằng việc chủ động cấu hình kết nối, bạn cho phép chúng tôi truyền
                nhận dữ liệu với:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>Meta (Facebook, Messenger):</strong> Sau Facebook Login for Business, hệ
                  thống dùng quyền <code className="text-white/80">pages_show_list</code> (và các
                  quyền liên quan trên cùng Login Configuration như{' '}
                  <code className="text-white/80">pages_read_engagement</code>,{' '}
                  <code className="text-white/80">pages_manage_posts</code>) để đọc danh sách
                  Fanpage bạn quản lý và — khi bạn chọn — đăng bài lên Feed/Photos qua API. Dữ liệu
                  Fanpage (Page ID, tên, ảnh đại diện, token mã hóa) được lưu theo Tổ chức
                  (Organization) cho đến khi bạn ngắt kết nối hoặc yêu cầu xóa. Khi bạn bật Chatbot
                  CSKH / nhắn tin hàng loạt, hệ thống có thể lưu PSID, hội thoại Messenger và lead
                  gắn với Fanpage đã kết nối để phản hồi và chăm sóc khách hàng trong phạm vi Tổ
                  chức của bạn.
                </li>
                <li>
                  <strong>Zalo (Zalo OA, Zalo Business):</strong> Gửi tin nhắn CSKH động và gửi tin
                  nhắn theo mẫu (ZBS).
                </li>
                <li>
                  <strong>Google (Ad Account):</strong> Tải dữ liệu báo cáo hiệu suất quảng cáo để
                  hiển thị biểu đồ thống kê.
                </li>
                <li>
                  <strong>WordPress:</strong> Tự động đăng tải các bài viết tiếp thị từ AI lên trang
                  blog của bạn.
                </li>
              </ul>
              <p>
                Chúng tôi không lưu trữ mật khẩu tài khoản bên thứ ba của bạn, chỉ lưu trữ mã token
                truy cập đã mã hóa do chính bạn cấp quyền. Bạn có quyền thu hồi quyền truy cập này
                bất cứ lúc nào từ tài khoản bên thứ ba của mình.
              </p>
            </section>

            {/* Section 5 */}
            <section id="5-chia-se-du-lieu" className="scroll-mt-24 space-y-4">
              <h2 className="text-xl font-bold text-white border-b border-white/10 pb-2">
                5. Nguyên tắc chia sẻ dữ liệu
              </h2>
              <p>
                Chúng tôi cam kết <strong>không bán, cho thuê hoặc chia sẻ</strong> thông tin cá
                nhân của bạn, dữ liệu Facebook đã được cấp phép, hoặc dữ liệu khách hàng của doanh
                nghiệp bạn cho bất kỳ bên thứ ba nào vì mục đích quảng cáo hoặc thương mại riêng của
                họ.
              </p>
              <p>
                Dữ liệu chỉ được cung cấp hạn chế cho đơn vị xử lý cần thiết để vận hành dịch vụ,
                hoặc theo yêu cầu pháp luật — cụ thể:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  Khi có yêu cầu từ chính bạn để liên kết dữ liệu với các đối tác dịch vụ bên thứ
                  ba.
                </li>
                <li>
                  Cung cấp hạn chế cho các đơn vị xử lý / đối tác hạ tầng kỹ thuật cần thiết hỗ trợ
                  vận hành hệ thống (ví dụ: dịch vụ gửi email, máy chủ đám mây, cổng thanh toán).
                  Các bên này chỉ xử lý dữ liệu theo chỉ định của chúng tôi và cam kết bảo mật bằng
                  văn bản.
                </li>
                <li>
                  Khi có yêu cầu bằng văn bản từ cơ quan nhà nước có thẩm quyền hoặc tòa án theo quy
                  định pháp luật Việt Nam.
                </li>
              </ul>
            </section>

            {/* Section 6 */}
            <section id="6-chinh-sach-cookie" className="scroll-mt-24 space-y-4">
              <h2 className="text-xl font-bold text-white border-b border-white/10 pb-2">
                6. Chính sách Cookie
              </h2>
              <p>
                Hệ thống sử dụng cookie và các công nghệ lưu trữ tương tự (LocalStorage) để duy trì
                trạng thái đăng nhập, ghi nhớ tùy chọn cá nhân và phục vụ hoạt động đo lường hiệu
                suất trang web:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>Cookie bắt buộc:</strong> Dùng để xác thực phiên hoạt động và giữ cho tài
                  khoản của bạn được đăng nhập an toàn trong suốt quá trình làm việc.
                </li>
                <li>
                  <strong>Cookie giới thiệu (Affiliate Cookie):</strong> Chúng tôi lưu trữ mã giới
                  thiệu (`msa_ref` và `msa_ref_js`) trong vòng 30 ngày để ghi nhận nguồn đăng ký tài
                  khoản từ các Cộng tác viên liên kết (Affiliate program) của bạn.
                </li>
              </ul>
              <p>
                Bạn có thể tắt hoặc xóa cookie bất cứ lúc nào thông qua cài đặt của trình duyệt. Tuy
                nhiên, việc tắt cookie bắt buộc có thể khiến bạn không thể đăng nhập hoặc sử dụng
                một số tính năng của dịch vụ.
              </p>
            </section>

            {/* Section 7 */}
            <section id="7-quyen-nguoi-dung" className="scroll-mt-24 space-y-4">
              <h2 className="text-xl font-bold text-white border-b border-white/10 pb-2">
                7. Quyền của người dùng đối với dữ liệu cá nhân
              </h2>
              <p>
                Khách hàng của MarketingAutoAZ được bảo đảm đầy đủ các quyền lợi đối với thông tin
                cá nhân của mình:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>Quyền truy cập và cập nhật:</strong> Xem và sửa đổi thông tin cá nhân của
                  bạn trực tiếp trong phần Cài đặt tài khoản.
                </li>
                <li>
                  <strong>Quyền thu hồi liên kết:</strong> Ngắt kết nối Fanpage tại{' '}
                  <Link href="/content?tab=channels" className="text-[#F97316] hover:underline">
                    Content &amp; Auto post → Kết nối kênh
                  </Link>{' '}
                  (<code className="text-white/70">/content?tab=channels</code>), hoặc thu hồi quyền
                  trên Facebook; đồng thời có thể ngắt Zalo và xóa token đã mã hóa khỏi hệ thống bất
                  kỳ lúc nào.
                </li>
                <li>
                  <strong>Quyền xuất dữ liệu:</strong> Xuất báo cáo dữ liệu khách hàng hoặc lịch sử
                  chiến dịch dưới dạng file Excel/CSV.
                </li>
                <li>
                  <strong>Quyền yêu cầu xóa:</strong> Yêu cầu chúng tôi xóa hoàn toàn tài khoản và
                  toàn bộ thông tin cá nhân lưu trữ trên hệ thống.
                </li>
              </ul>
            </section>

            {/* Section 8 */}
            <section id="8-yeu-cau-xoa-du-lieu" className="scroll-mt-24 space-y-4">
              <h2 className="text-xl font-bold text-white border-b border-white/10 pb-2">
                8. Quy trình và Hướng dẫn yêu cầu xóa dữ liệu liên kết Facebook
              </h2>
              <p>
                Để tuân thủ các quy định bảo vệ dữ liệu của nhà phát triển Meta, chúng tôi cung cấp
                quy trình xóa dữ liệu rõ ràng. Nếu bạn muốn xóa các dữ liệu liên kết Facebook
                Fanpage/Messenger mà hệ thống đang lưu giữ tạm thời:
              </p>
              <div className="rounded-lg border border-white/10 bg-card p-5 space-y-3">
                <p className="font-semibold text-white">Quy trình yêu cầu xóa dữ liệu:</p>
                <ol className="list-decimal pl-5 space-y-1.5">
                  <li>
                    Xem chi tiết hướng dẫn tự động hóa xóa quyền truy cập ứng dụng trên Meta tại
                    trang:{' '}
                    <Link
                      href="/facebook/data-deletion"
                      className="text-[#F97316] hover:underline font-medium"
                    >
                      Hướng dẫn xóa dữ liệu Facebook
                    </Link>
                    .
                  </li>
                  <li>
                    Hoặc gửi email yêu cầu trực tiếp kèm theo thông tin định danh tài khoản đến địa
                    chỉ{' '}
                    <a
                      href={`mailto:${CONTACT_EMAIL}`}
                      className="text-[#F97316] hover:underline font-medium"
                    >
                      {CONTACT_EMAIL}
                    </a>
                    .
                  </li>
                  <li>
                    Hệ thống sẽ xác thực và tiến hành xóa toàn bộ thông tin liên quan đến{' '}
                    <strong>Page ID</strong>, <strong>tên Fanpage</strong>,{' '}
                    <strong>ảnh đại diện trang</strong>, mã Page Access Token đã mã hóa
                    (AES-256-GCM) và lịch sử đăng bài liên quan trong vòng{' '}
                    <strong>72 giờ làm việc</strong> kể từ khi tiếp nhận.
                  </li>
                </ol>
                <p className="text-sm text-muted-foreground">
                  <strong className="text-white/90">Thời gian lưu (retention):</strong> Dữ liệu
                  Fanpage và token mã hóa được giữ trong suốt thời gian Page còn kết nối với Tổ chức
                  của bạn. Khi bạn ngắt kết nối từng Page / ngắt tất cả, hoặc Meta gửi callback
                  deauthorize / data deletion, token và metadata Page liên quan được xóa hoặc vô
                  hiệu hóa theo quy trình trên (SLA xóa yêu cầu thủ công: 72 giờ làm việc).
                </p>
              </div>
            </section>

            {/* Section 9 */}
            <section id="9-thay-doi-chinh-sach" className="scroll-mt-24 space-y-4">
              <h2 className="text-xl font-bold text-white border-b border-white/10 pb-2">
                9. Thay đổi chính sách bảo mật
              </h2>
              <p>
                Chính sách bảo mật này có thể được điều chỉnh và nâng cấp định kỳ để đảm bảo tuân
                thủ tốt nhất các quy định mới nhất của pháp luật và sự phát triển của công nghệ bảo
                mật.
              </p>
              <p>
                Mọi thay đổi sẽ được cập nhật trực tiếp trên trang này kèm theo ngày cập nhật mới
                nhất ở đầu trang. Việc bạn tiếp tục sử dụng dịch vụ sau khi chính sách thay đổi đồng
                nghĩa với việc bạn đã đồng ý và chấp thuận với toàn bộ nội dung sửa đổi đó.
              </p>
            </section>

            {/* Section 10 */}
            <section id="10-thong-tin-lien-he" className="scroll-mt-24 space-y-4">
              <h2 className="text-xl font-bold text-white border-b border-white/10 pb-2">
                10. Thông tin liên hệ giải đáp thắc mắc
              </h2>
              <p>
                Mọi ý kiến đóng góp, thắc mắc hoặc yêu cầu hỗ trợ kỹ thuật liên quan đến bảo mật và
                quyền riêng tư dữ liệu, vui lòng liên hệ với CÔNG TY TNHH THẾ GIỚI DIGI theo thông
                tin chính thức sau:
              </p>
              <div className="rounded-lg border border-white/10 bg-card p-6 space-y-4">
                <h3 className="font-semibold text-lg text-white">CÔNG TY TNHH THẾ GIỚI DIGI</h3>
                <div className="space-y-2 text-muted-foreground text-xs">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-[#F97316] shrink-0" />
                    <span>
                      Email:{' '}
                      <a
                        href={`mailto:${CONTACT_EMAIL}`}
                        className="text-[#F97316] hover:underline font-medium"
                      >
                        {CONTACT_EMAIL}
                      </a>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-[#F97316] shrink-0" />
                    <span>
                      Điện thoại:{' '}
                      <a href={`tel:${CONTACT_PHONE.replace(/\s/g, '')}`} className="font-medium">
                        {CONTACT_PHONE}
                      </a>
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-[#F97316] shrink-0 mt-0.5" />
                    <span>
                      Địa chỉ: <strong>{CONTACT_ADDRESS}</strong>
                    </span>
                  </div>
                </div>
              </div>
            </section>
          </main>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-black/20 py-8 text-xs text-muted-foreground mt-20">
        <div className="container mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            &copy; 2026 <strong>CÔNG TY TNHH THẾ GIỚI DIGI</strong>. Bảo lưu mọi quyền lợi.
          </div>
          <div className="flex flex-wrap gap-4 sm:gap-6">
            <Link href="/" className="hover:text-white transition-colors">
              Trang chủ
            </Link>
            <Link href="/terms" className="hover:text-white transition-colors">
              Điều khoản dịch vụ
            </Link>
            <Link href="/facebook/data-deletion" className="hover:text-white transition-colors">
              Yêu cầu xóa dữ liệu Facebook
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
