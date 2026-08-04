import type { Metadata } from 'next';
import Link from 'next/link';
import { FileText, ChevronRight, Mail, Phone, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BrandLogo } from '@/components/brand/brand-logo';

const SITE_URL = 'https://marketingautoaz.com';
const CONTACT_EMAIL = 'thegioimarketingdigi@gmail.com';
const CONTACT_PHONE = '0934 077 360';
const CONTACT_ADDRESS = '134/93 Lý Chính Thắng, Phường Xuân Hòa, Thành phố Hồ Chí Minh, Việt Nam';

export const metadata: Metadata = {
  title: 'Điều khoản dịch vụ | MarketingAutoAZ',
  description:
    'Điều khoản dịch vụ và quy định sử dụng nền tảng MarketingAutoAZ - Vận hành bởi CÔNG TY TNHH THẾ GIỚI DIGI. Xem chi tiết quyền lợi và nghĩa vụ của người dùng.',
  alternates: {
    canonical: `${SITE_URL}/terms`,
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: 'Điều khoản dịch vụ | MarketingAutoAZ',
    description:
      'Điều khoản dịch vụ và quy định sử dụng nền tảng MarketingAutoAZ - Vận hành bởi CÔNG TY TNHH THẾ GIỚI DIGI.',
    url: `${SITE_URL}/terms`,
    siteName: 'MarketingAutoAZ',
    type: 'website',
    locale: 'vi_VN',
    images: [
      { url: `${SITE_URL}/brand/logo.png`, width: 1024, height: 1024, alt: 'MarketingAutoAZ' },
    ],
  },
};

const sections = [
  { id: '1-chap-nhan-dieu-khoan', title: '1. Chấp nhận điều khoản' },
  { id: '2-tai-khoan-bao-mat', title: '2. Tài khoản & Bảo mật' },
  { id: '3-goi-dich-vu-thanh-toan', title: '3. Dịch vụ & Thanh toán' },
  { id: '4-trach-nhiem-content-ai', title: '4. Trách nhiệm nội dung AI' },
  { id: '5-ket-noi-ben-thu-ba', title: '5. Kết nối bên thứ ba' },
  { id: '6-dang-bai-chong-spam', title: '6. Đăng bài & Chống Spam' },
  { id: '7-hanh-vi-bi-cam-lam-dung', title: '7. Hành vi bị cấm & Lạm dụng' },
  { id: '8-so-huu-tri-tue', title: '8. Quyền sở hữu trí tuệ' },
  { id: '9-du-lieu-quyen-rieng-tu', title: '9. Dữ liệu & Quyền riêng tư' },
  { id: '10-tam-khoa-cham-dut', title: '10. Tạm khóa & Chấm dứt' },
  { id: '11-gioi-han-trach-nhiem', title: '11. Giới hạn trách nhiệm' },
  { id: '12-thay-doi-dieu-khoan', title: '12. Thay đổi điều khoản' },
  { id: '13-phap-luat-tranh-chap', title: '13. Luật áp dụng & Tranh chấp' },
  { id: '14-thong-tin-lien-he', title: '14. Thông tin liên hệ' },
];

export default function TermsPage() {
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
            <FileText className="h-4 w-4" />
            Văn bản pháp lý
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl md:text-5xl">
            Điều khoản dịch vụ
          </h1>
          <p className="mt-4 text-base text-muted-foreground max-w-2xl">
            Chào mừng bạn đến với MarketingAutoAZ. Vui lòng đọc kỹ các điều khoản sử dụng dưới đây
            trước khi bắt đầu sử dụng các tính năng trên hệ thống của chúng tôi.
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
            <section id="1-chap-nhan-dieu-khoan" className="scroll-mt-24 space-y-4">
              <h2 className="text-xl font-bold text-white border-b border-white/10 pb-2">
                1. Chấp nhận điều khoản và điều kiện sử dụng
              </h2>
              <p>
                Bằng việc đăng ký tài khoản, truy cập hoặc sử dụng bất kỳ dịch vụ nào do nền tảng{' '}
                <strong>MarketingAutoAZ</strong> cung cấp, bạn xác nhận rằng bạn đã đọc, hiểu và
                đồng ý chịu sự ràng buộc bởi các Điều khoản dịch vụ này, cùng với{' '}
                <Link href="/privacy" className="text-[#F97316] hover:underline">
                  Chính sách bảo mật
                </Link>{' '}
                của chúng tôi.
              </p>
              <p>
                Nếu bạn không đồng ý với bất kỳ phần nào trong các điều khoản này, vui lòng không
                đăng ký hoặc ngừng sử dụng toàn bộ dịch vụ của MarketingAutoAZ ngay lập tức. Việc
                bạn tiếp tục sử dụng dịch vụ sau khi các điều khoản có sự thay đổi sẽ được coi là
                bạn đã chấp nhận các sửa đổi đó.
              </p>
            </section>

            {/* Section 2 */}
            <section id="2-tai-khoan-bao-mat" className="scroll-mt-24 space-y-4">
              <h2 className="text-xl font-bold text-white border-b border-white/10 pb-2">
                2. Tài khoản, tổ chức (organization) và bảo mật đăng nhập
              </h2>
              <p>
                Để sử dụng các tính năng nâng cao, bạn cần tạo tài khoản cá nhân và liên kết với một
                Tổ chức (Organization) cụ thể. Mỗi Organization đóng vai trò là một không gian làm
                việc độc lập và dữ liệu sẽ được cô lập tuyệt đối dựa trên mã định danh tổ chức đó.
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  Bạn cam kết cung cấp thông tin đăng ký chính xác, đầy đủ và cập nhật thường xuyên.
                </li>
                <li>
                  Bạn tự chịu trách nhiệm bảo mật thông tin đăng nhập của mình, bao gồm mật khẩu, mã
                  API Key, và các mã thông báo kết nối hệ thống (tokens).
                </li>
                <li>
                  Bạn chịu hoàn toàn trách nhiệm pháp lý đối với tất cả các hoạt động diễn ra dưới
                  tài khoản hoặc trong phạm vi Tổ chức (Organization) của bạn.
                </li>
                <li>
                  Trường hợp phát hiện tài khoản bị truy cập trái phép, bạn phải thông báo ngay lập
                  tức cho bộ phận kỹ thuật hỗ trợ của chúng tôi để kịp thời xử lý.
                </li>
              </ul>
            </section>

            {/* Section 3 */}
            <section id="3-goi-dich-vu-thanh-toan" className="scroll-mt-24 space-y-4">
              <h2 className="text-xl font-bold text-white border-b border-white/10 pb-2">
                3. Gói dịch vụ, thanh toán, thời hạn, dùng thử và credit
              </h2>
              <p>
                MarketingAutoAZ cung cấp các gói dịch vụ trả phí định kỳ (theo tháng hoặc theo năm)
                và các dịch vụ phụ trợ đi kèm.
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>Gói cước và thời hạn:</strong> Phí dịch vụ được thanh toán trước khi bắt
                  đầu chu kỳ sử dụng. Gói dịch vụ sẽ tự động hết hạn nếu việc thanh toán gia hạn
                  không được hoàn tất đúng hạn.
                </li>
                <li>
                  <strong>Chương trình dùng thử (Trial):</strong> Chúng tôi có thể cung cấp các gói
                  dùng thử miễn phí với các tính năng bị giới hạn. CÔNG TY TNHH THẾ GIỚI DIGI có
                  toàn quyền sửa đổi, tạm ngưng hoặc chấm dứt chương trình dùng thử bất cứ lúc nào
                  mà không cần báo trước.
                </li>
                <li>
                  <strong>Hệ thống Credit:</strong> Một số tính năng như tạo Content AI hoặc gửi tin
                  nhắn có thể yêu cầu thanh toán bằng đơn vị Credit trong tài khoản. Credit không có
                  giá trị quy đổi thành tiền mặt, không được chuyển nhượng giữa các tài khoản khác
                  tổ chức và không được hoàn lại dưới bất kỳ hình thức nào.
                </li>
                <li>
                  <strong>Chính sách hoàn phí:</strong> Trừ trường hợp pháp luật có quy định khác,
                  tất cả các khoản phí đã thanh toán cho chúng tôi đều không được hoàn lại.
                </li>
              </ul>
            </section>

            {/* Section 4 */}
            <section id="4-trach-nhiem-content-ai" className="scroll-mt-24 space-y-4">
              <h2 className="text-xl font-bold text-white border-b border-white/10 pb-2">
                4. Trách nhiệm kiểm tra nội dung do trí tuệ nhân tạo (AI) tạo ra
              </h2>
              <p>
                Dịch vụ Content AI của MarketingAutoAZ sử dụng các mô hình ngôn ngữ lớn (LLM) để hỗ
                trợ người dùng tạo ra nội dung tiếp thị, bài viết mạng xã hội hoặc trả lời tin nhắn
                tự động.
              </p>
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-amber-200">
                <p className="font-semibold mb-1">Cảnh báo quan trọng:</p>
                <p>
                  Nội dung do trí tuệ nhân tạo tạo ra chỉ mang tính chất tham khảo và gợi ý. Khách
                  hàng bắt buộc phải tự rà soát, chỉnh sửa và xác thực độ chính xác, tính chuẩn mực,
                  tính hợp pháp và quyền sở hữu trí tuệ của nội dung trước khi xuất bản hoặc gửi cho
                  khách hàng cuối.
                </p>
              </div>
              <p>
                CÔNG TY TNHH THẾ GIỚI DIGI không chịu bất kỳ trách nhiệm pháp lý hoặc bồi thường
                thiệt hại nào đối với các vấn đề liên quan đến thông tin sai lệch, vi phạm thuần
                phong mỹ tục, bản quyền hoặc vi phạm pháp luật phát sinh từ nội dung được tạo ra bởi
                tính năng AI của hệ thống.
              </p>
            </section>

            {/* Section 5 */}
            <section id="5-ket-noi-ben-thu-ba" className="scroll-mt-24 space-y-4">
              <h2 className="text-xl font-bold text-white border-b border-white/10 pb-2">
                5. Kết nối Facebook, Google, Zalo, WordPress và nền tảng bên thứ ba
              </h2>
              <p>
                Hệ thống của chúng tôi cho phép tích hợp với các dịch vụ của bên thứ ba qua các giao
                thức API chính thức để hỗ trợ đồng bộ dữ liệu, đăng tải bài viết và quản lý tin nhắn
                chăm sóc khách hàng.
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  Khi sử dụng các tính năng liên kết này, bạn đồng ý tuân thủ toàn bộ các chính
                  sách, điều khoản dịch vụ riêng biệt của từng bên thứ ba đó (ví dụ: Chính sách nền
                  tảng Meta/Facebook, Chính sách nhà phát triển Zalo, Điều khoản dịch vụ Google
                  API).
                </li>
                <li>
                  Chúng tôi không kiểm soát và không chịu trách nhiệm trong trường hợp bên thứ ba
                  thay đổi chính sách, cơ chế API, tạm dừng dịch vụ hoặc thu hồi mã token truy cập,
                  làm gián đoạn tính năng liên kết của MarketingAutoAZ.
                </li>
                <li>
                  Bạn có quyền ngắt kết nối với các ứng dụng bên thứ ba này bất kỳ lúc nào thông qua
                  phần cấu hình kênh tiếp thị trong tài khoản của bạn.
                </li>
              </ul>
            </section>

            {/* Section 6 */}
            <section id="6-dang-bai-chong-spam" className="scroll-mt-24 space-y-4">
              <h2 className="text-xl font-bold text-white border-b border-white/10 pb-2">
                6. Quy định đăng bài, gửi tin nhắn hàng loạt và chống spam
              </h2>
              <p>
                Để bảo vệ uy tín của hệ thống và tránh tài khoản của người dùng bị các nền tảng mạng
                xã hội khóa, chúng tôi áp dụng quy tắc nghiêm ngặt về phòng chống thư rác (spam):
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  Nghiêm cấm gửi tin nhắn quảng cáo hàng loạt đến những người dùng chưa thực hiện
                  đăng ký nhận tin (Opt-in) hoặc ngoài khung giờ tương tác cho phép của nền tảng (ví
                  dụ: quy tắc 24h đối với Facebook Messenger).
                </li>
                <li>
                  Không sử dụng tính năng đăng bài tự động để spam các nội dung giống hệt nhau liên
                  tục trên nhiều trang hoặc group trong thời gian ngắn.
                </li>
                <li>
                  Chúng tôi thiết lập các giới hạn kỹ thuật (Rate limits) về số lượng tin nhắn gửi
                  đi và bài đăng theo giờ/ngày. Mọi hành vi tìm cách vượt qua các giới hạn này sẽ bị
                  coi là vi phạm nghiêm trọng Điều khoản dịch vụ.
                </li>
              </ul>
            </section>

            {/* Section 7 */}
            <section id="7-hanh-vi-bi-cam-lam-dung" className="scroll-mt-24 space-y-4">
              <h2 className="text-xl font-bold text-white border-b border-white/10 pb-2">
                7. Các hành vi bị nghiêm cấm, gian lận và lạm dụng
              </h2>
              <p>Người dùng dịch vụ không được phép thực hiện các hành vi sau:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  Tạo nhiều tài khoản ảo nhằm lạm dụng chương trình dùng thử miễn phí (Trial abuse)
                  hoặc trục lợi các tài nguyên miễn phí khác của hệ thống.
                </li>
                <li>
                  Lạm dụng chương trình Cộng tác viên (Affiliate), bao gồm việc tự giới thiệu bản
                  thân thông qua mã liên kết của mình để hưởng hoa hồng (Self-referral), sử dụng các
                  thủ thuật quảng cáo sai sự thật hoặc phát tán spam liên kết để lôi kéo người dùng.
                </li>
                <li>
                  Sử dụng dịch vụ để truyền tải các tài liệu vi phạm pháp luật, đe dọa, xúc phạm
                  danh dự người khác, nội dung khiêu dâm, bạo lực hoặc trái với chuẩn mực đạo đức xã
                  hội.
                </li>
                <li>
                  Thực hiện các hành vi phá hoại kỹ thuật như: đảo ngược mã nguồn (reverse
                  engineering), tấn công từ chối dịch vụ (DDoS), phát tán mã độc hoặc khai thác lỗ
                  hổng hệ thống.
                </li>
              </ul>
            </section>

            {/* Section 8 */}
            <section id="8-so-huu-tri-tue" className="scroll-mt-24 space-y-4">
              <h2 className="text-xl font-bold text-white border-b border-white/10 pb-2">
                8. Quyền sở hữu trí tuệ
              </h2>
              <p>
                Toàn bộ nền tảng MarketingAutoAZ, bao gồm giao diện người dùng, logo thương hiệu, mã
                nguồn ứng dụng, tài liệu hướng dẫn, hình ảnh đồ họa và cấu trúc cơ sở dữ liệu đều
                thuộc sở hữu độc quyền của <strong>CÔNG TY TNHH THẾ GIỚI DIGI</strong> hoặc các đối
                tác được cấp phép. Bạn không được quyền sao chép, sửa đổi, phân phối hoặc sử dụng
                cho mục đích thương mại riêng mà không có sự đồng ý bằng văn bản của chúng tôi.
              </p>
              <p>
                Đối với dữ liệu, nội dung do bạn đăng tải lên hoặc tạo ra thông qua các công cụ của
                chúng tôi, bạn giữ quyền sở hữu trí tuệ hợp pháp của mình và cấp cho chúng tôi quyền
                sử dụng phi độc quyền, có giới hạn để phục vụ cho việc truyền tải, lưu trữ dữ liệu
                và xử lý các tính năng trong hệ thống.
              </p>
            </section>

            {/* Section 9 */}
            <section id="9-du-lieu-quyen-rieng-tu" className="scroll-mt-24 space-y-4">
              <h2 className="text-xl font-bold text-white border-b border-white/10 pb-2">
                9. Dữ liệu người dùng và chính sách quyền riêng tư
              </h2>
              <p>
                Quyền riêng tư của bạn là ưu tiên hàng đầu của chúng tôi. Việc thu thập, lưu trữ, sử
                dụng và bảo mật các thông tin cá nhân và dữ liệu doanh nghiệp của bạn được điều
                chỉnh chi tiết bởi{' '}
                <Link href="/privacy" className="text-[#F97316] hover:underline">
                  Chính sách quyền riêng tư
                </Link>{' '}
                của chúng tôi.
              </p>
              <p>
                Mọi thông tin nhạy cảm liên quan đến token truy cập tài khoản bên thứ ba đều được mã
                hóa ở mức cơ sở dữ liệu nhằm ngăn chặn rò rỉ thông tin ngay cả trong trường hợp bị
                tấn công.
              </p>
            </section>

            {/* Section 10 */}
            <section id="10-tam-khoa-cham-dut" className="scroll-mt-24 space-y-4">
              <h2 className="text-xl font-bold text-white border-b border-white/10 pb-2">
                10. Tạm khóa hoặc chấm dứt tài khoản sử dụng
              </h2>
              <p>
                CÔNG TY TNHH THẾ GIỚI DIGI có toàn quyền đơn phương đình chỉ tạm thời hoặc chấm dứt
                vĩnh viễn tài khoản và quyền truy cập hệ thống của người dùng hoặc Tổ chức
                (Organization) mà không cần báo trước trong các trường hợp:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>Vi phạm bất kỳ điều khoản nào quy định trong văn bản này.</li>
                <li>Không hoàn tất thanh toán chi phí gia hạn gói dịch vụ đúng hạn.</li>
                <li>Có dấu hiệu thực hiện hành vi lừa đảo, trục lợi hoặc phá hoại hệ thống.</li>
                <li>Theo yêu cầu bằng văn bản từ cơ quan nhà nước có thẩm quyền.</li>
              </ul>
              <p>
                Khi tài khoản bị chấm dứt, toàn bộ quyền truy cập dịch vụ sẽ ngay lập tức bị vô hiệu
                và các dữ liệu liên quan có thể bị xóa vĩnh viễn sau một khoảng thời gian chờ xử lý
                theo quy định của hệ thống.
              </p>
            </section>

            {/* Section 11 */}
            <section id="11-gioi-han-trach-nhiem" className="scroll-mt-24 space-y-4">
              <h2 className="text-xl font-bold text-white border-b border-white/10 pb-2">
                11. Giới hạn trách nhiệm pháp lý
              </h2>
              <p>
                Dịch vụ MarketingAutoAZ được cung cấp trên cơ sở nguyên trạng &ldquo;như hiện
                có&rdquo; và &ldquo;sẵn có&rdquo;. Chúng tôi không đưa ra bất kỳ bảo đảm nào rằng
                dịch vụ sẽ liên tục không bị gián đoạn, hoàn hảo không có lỗi kỹ thuật, hoặc mọi kết
                quả tiếp thị từ việc sử dụng công cụ đều đạt được doanh thu mong muốn.
              </p>
              <p>
                Trong mọi trường hợp được pháp luật cho phép, tổng trách nhiệm bồi thường thiệt hại
                của CÔNG TY TNHH THẾ GIỚI DIGI đối với tất cả các khiếu nại phát sinh từ việc sử
                dụng dịch vụ sẽ không vượt quá tổng số tiền mà bạn đã thực tế thanh toán cho chúng
                tôi để mua gói dịch vụ trong vòng <strong>01 tháng gần nhất</strong> trước thời điểm
                phát sinh sự việc khiếu nại.
              </p>
            </section>

            {/* Section 12 */}
            <section id="12-thay-doi-dieu-khoan" className="scroll-mt-24 space-y-4">
              <h2 className="text-xl font-bold text-white border-b border-white/10 pb-2">
                12. Thay đổi dịch vụ và điều khoản dịch vụ
              </h2>
              <p>
                Chúng tôi liên tục cải tiến hệ thống và có quyền nâng cấp, thay đổi tính năng, cơ
                cấu gói cước hoặc ngừng cung cấp một phần dịch vụ bất kỳ lúc nào để phù hợp với thị
                trường và công nghệ mới.
              </p>
              <p>
                Các thay đổi đối với Điều khoản dịch vụ này sẽ được đăng tải trực tiếp trên trang
                web này kèm theo ngày cập nhật mới nhất. Bạn có trách nhiệm truy cập trang web này
                thường xuyên để cập nhật các quy định mới. Việc tiếp tục sử dụng dịch vụ đồng nghĩa
                với việc đồng ý chịu sự ràng buộc bởi các điều khoản sửa đổi đó.
              </p>
            </section>

            {/* Section 13 */}
            <section id="13-phap-luat-tranh-chap" className="scroll-mt-24 space-y-4">
              <h2 className="text-xl font-bold text-white border-b border-white/10 pb-2">
                13. Áp dụng pháp luật Việt Nam và giải quyết tranh chấp
              </h2>
              <p>
                Các Điều khoản dịch vụ này được giải thích và điều chỉnh theo quy định của pháp luật
                nước Cộng hòa Xã hội Chủ nghĩa Việt Nam.
              </p>
              <p>
                Mọi tranh chấp phát sinh từ hoặc liên quan đến việc sử dụng dịch vụ trước hết sẽ
                được giải quyết thông qua thương lượng hòa giải giữa các bên trên tinh thần tôn
                trọng quyền lợi của nhau. Trong trường hợp không thể tự thương lượng giải quyết
                trong vòng 30 ngày, tranh chấp sẽ được đưa ra phân xử tại Tòa án nhân dân có thẩm
                quyền tại Thành phố Hồ Chí Minh.
              </p>
            </section>

            {/* Section 14 */}
            <section id="14-thong-tin-lien-he" className="scroll-mt-24 space-y-4">
              <h2 className="text-xl font-bold text-white border-b border-white/10 pb-2">
                14. Thông tin liên hệ
              </h2>
              <p>
                Nếu bạn có bất kỳ câu hỏi nào liên quan đến các Điều khoản dịch vụ này, hoặc cần hỗ
                trợ về mặt kỹ thuật và thanh toán, vui lòng liên hệ với đơn vị vận hành hệ thống
                theo thông tin dưới đây:
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
            <Link href="/privacy" className="hover:text-white transition-colors">
              Chính sách bảo mật
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
