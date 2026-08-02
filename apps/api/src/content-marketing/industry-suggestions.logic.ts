import type { OpenAiService } from '../openai/openai.service';
import {
  buildFullIndustryPromptContext,
  resolveIndustryContext,
  type IndustryFields,
} from './industry-context.util';
import { SPA_BEAUTY_INDUSTRY_ID } from './content-industry.constants';

export type IndustrySuggestionBundle = {
  industry: string;
  industryId: string | null;
  slug: string;
  isCustom: boolean;
  isRegulated: boolean;
  regulatedWarning: string | null;
  topics: string[];
  postTypes: Array<{ value: string; label: string }>;
  tones: string[];
  audiences: string[];
  ctas: string[];
  hashtags: string[];
  productIdeas: string[];
  source: 'catalog' | 'ai' | 'fallback';
};

const POST_TYPES = [
  { value: 'sales', label: 'Bán hàng' },
  { value: 'knowledge', label: 'Kiến thức' },
  { value: 'brand', label: 'Thương hiệu' },
  { value: 'engagement', label: 'Tương tác' },
  { value: 'promo', label: 'Ưu đãi' },
  { value: 'story', label: 'Câu chuyện' },
  { value: 'review', label: 'Review / feedback' },
] as const;

type CatalogEntry = Omit<
  IndustrySuggestionBundle,
  'industry' | 'industryId' | 'slug' | 'isCustom' | 'isRegulated' | 'regulatedWarning' | 'source'
>;

const CATALOG: Record<string, CatalogEntry> = {
  'spa-beauty': {
    topics: [
      'Liệu trình phù hợp làn da',
      'Chăm sóc sau liệu trình',
      'Câu chuyện khách tự tin hơn',
      'Ưu đãi theo mùa',
      'Kiến thức chăm sóc da',
    ],
    postTypes: [...POST_TYPES],
    tones: ['Êm dịu', 'Thấu cảm', 'Chuyên gia', 'Gần gũi'],
    audiences: ['Nữ 25–45 quan tâm làn da', 'Khách văn phòng', 'Mẹ bỉm'],
    ctas: ['Inbox tư vấn liệu trình', 'Đặt lịch trải nghiệm', 'Nhận ưu đãi hôm nay'],
    hashtags: ['#Spa', '#LamDep', '#ChamSocDa', '#LieuTrinh'],
    productIdeas: [
      'Liệu trình trẻ hóa da chuyên sâu',
      'Gội đầu dưỡng sinh',
      'Massage body thư giãn',
      'Chăm sóc da mụn / da nhạy cảm',
      'Tắm trắng / body treatment',
      'Giảm mỡ / slimming',
      'Triệt lông / laser thẩm mỹ',
      'Phun mày / phun môi',
      'Nail / mi / lash',
      'Gói combo spa VIP',
      'Liệu trình detox / xông hơi',
    ],
  },
  'tham-my-vien': {
    topics: ['Tư vấn thẩm mỹ an toàn', 'Công nghệ mới', 'Case trước/sau (có consent)', 'Ưu đãi liệu trình', 'Chăm sóc sau thủ thuật'],
    postTypes: [...POST_TYPES],
    tones: ['Chuyên gia', 'Thận trọng', 'Tin cậy'],
    audiences: ['Khách quan tâm thẩm mỹ', 'Nữ 25–45', 'Khách tái khám'],
    ctas: ['Đặt lịch tư vấn', 'Inbox hỏi liệu trình', 'Nhận checklist trước thủ thuật'],
    hashtags: ['#ThamMy', '#LamDep', '#TuVan'],
    productIdeas: [
      'Tư vấn thẩm mỹ',
      'Liệu trình trẻ hóa',
      'Điều trị da chuyên sâu',
      'Phun xăm thẩm mỹ',
      'Nâng cơ / contourn',
      'Gói chăm sóc sau thủ thuật',
    ],
  },
  'salon-toc-nail': {
    topics: ['Xu hướng tóc mùa này', 'Nail design nổi bật', 'Chăm sóc tóc tại nhà', 'Ưu đãi combo', 'Review khách'],
    postTypes: [...POST_TYPES],
    tones: ['Thời trang', 'Vui', 'Gần gũi'],
    audiences: ['Gen Z', 'Văn phòng', 'Cô dâu / dự tiệc'],
    ctas: ['Đặt lịch cắt uốn', 'Inbox giữ chỗ nail', 'Nhận ưu đãi combo'],
    hashtags: ['#SalonToc', '#Nail', '#LamDep'],
    productIdeas: [
      'Cắt tóc tạo kiểu',
      'Uốn / nhuộm tóc',
      'Gội dưỡng / phục hồi tóc',
      'Nail gel / design',
      'Nối mi / nối tóc',
      'Combo tóc + nail',
    ],
  },
  'nha-khoa': {
    topics: ['Kiến thức răng miệng', 'Khi nào nên khám', 'Chăm sóc sau điều trị', 'Ưu đãi khám', 'Câu chuyện khách'],
    postTypes: [...POST_TYPES],
    tones: ['Thận trọng', 'Giáo dục', 'Tin cậy'],
    audiences: ['Gia đình', 'Người đau răng', 'Chỉnh nha'],
    ctas: ['Đặt lịch khám', 'Inbox tư vấn', 'Nhận checklist chăm sóc'],
    hashtags: ['#NhaKhoa', '#SucKhoeRangMieng', '#PhongKham'],
    productIdeas: [
      'Khám răng tổng quát',
      'Lấy cao răng',
      'Trám răng',
      'Tẩy trắng răng',
      'Niềng răng / chỉnh nha',
      'Implant',
      'Nha khoa trẻ em',
    ],
  },
  'nha-hang': {
    topics: ['Món signature', 'Không gian quán', 'Combo giờ vàng', 'Review khách', 'Nguyên liệu chọn lọc'],
    postTypes: [...POST_TYPES],
    tones: ['Gợi cảm giác', 'Vui', 'Gần gũi'],
    audiences: ['Nhóm bạn', 'Gia đình', 'Văn phòng ăn trưa', 'Foodie'],
    ctas: ['Đặt bàn ngay', 'Order ship', 'Inbox giữ chỗ', 'Check-in nhận ưu đãi'],
    hashtags: ['#NhaHang', '#AmThuc', '#DatBan', '#Foodie'],
    productIdeas: [
      'Set menu',
      'Món signature',
      'Buffet',
      'Combo gia đình',
      'Đồ uống',
      'Tiệc / đặt bàn nhóm',
      'Ship đồ ăn',
    ],
  },
  'cafe-do-uong': {
    topics: ['Thức uống mới', 'Không gian làm việc', 'Combo sáng', 'Check-in quán', 'Nguyên liệu'],
    postTypes: [...POST_TYPES],
    tones: ['Ấm áp', 'Trendy', 'Gần gũi'],
    audiences: ['Sinh viên', 'Freelancer', 'Cặp đôi', 'Dân văn phòng'],
    ctas: ['Ghé quán hôm nay', 'Order mang đi', 'Inbox đặt bàn'],
    hashtags: ['#Cafe', '#DoUong', '#CheckIn'],
    productIdeas: [
      'Cà phê đặc sản',
      'Trà / trà sữa',
      'Bánh ngọt',
      'Combo sáng',
      'Đồ uống theo mùa',
      'Set làm việc',
    ],
  },
  'thoi-trang-phu-kien': {
    topics: ['Outfit gợi ý', 'Hàng mới về', 'Phối đồ', 'Ưu đãi', 'Lookbook'],
    postTypes: [...POST_TYPES],
    tones: ['Thời trang', 'Trendy', 'Thuyết phục'],
    audiences: ['Gen Z', 'Văn phòng', 'Người thích shopping'],
    ctas: ['Xem bộ sưu tập', 'Inbox đặt size', 'Mua ngay'],
    hashtags: ['#ThoiTrang', '#PhuKien', '#Outfit'],
    productIdeas: [
      'Áo / quần',
      'Váy đầm',
      'Giày dép',
      'Túi xách',
      'Phụ kiện',
      'Đồ công sở',
      'BST theo mùa',
    ],
  },
  'my-pham-cham-soc': {
    topics: ['Routine skincare', 'Thành phần nổi bật', 'Review dùng thật', 'Combo tiết kiệm', 'Tips chăm sóc'],
    postTypes: [...POST_TYPES],
    tones: ['Chuyên gia', 'Thân thiện', 'Thuyết phục'],
    audiences: ['Người mới skincare', 'Da nhạy cảm', 'Makeup lover'],
    ctas: ['Nhận tư vấn routine', 'Mua combo', 'Inbox hỏi sản phẩm'],
    hashtags: ['#MyPham', '#Skincare', '#ChamSocCaNhan'],
    productIdeas: [
      'Serum',
      'Kem dưỡng',
      'Sữa rửa mặt',
      'Kem chống nắng',
      'Combo skincare',
      'Trang điểm',
      'Chăm sóc tóc / body',
    ],
  },
  'bat-dong-san': {
    topics: [
      'Căn hộ phù hợp gia đình trẻ',
      'Vị trí và tiện ích xung quanh',
      'Pháp lý minh bạch',
      'Xu hướng giá khu vực',
      'Câu chuyện khách đã chốt căn',
    ],
    postTypes: [...POST_TYPES],
    tones: ['Tin cậy', 'Chuyên nghiệp', 'Ấm áp', 'Thẳng thắn'],
    audiences: ['Gia đình trẻ mua nhà lần đầu', 'Nhà đầu tư nhỏ', 'Người tìm nhà cho thuê'],
    ctas: ['Đặt lịch xem nhà', 'Nhận bảng giá mới nhất', 'Inbox tư vấn khu vực', 'Giữ chỗ ưu đãi'],
    hashtags: ['#BatDongSan', '#CanHo', '#NhaDat', '#DauTu', '#PhapLy'],
    productIdeas: [
      'Căn hộ',
      'Căn hộ cao cấp',
      'Nhà phố',
      'Đất nền',
      'Biệt thự',
      'Shophouse',
      'Cho thuê căn hộ',
      'Cho thuê văn phòng',
      'Môi giới bất động sản',
      'Dự án bất động sản',
    ],
  },
  'giao-duc': {
    topics: [
      'Lộ trình học rõ ràng',
      'Kết quả học viên',
      'Phương pháp giảng dạy',
      'Học thử miễn phí',
      'Câu chuyện đổi nghề',
    ],
    postTypes: [...POST_TYPES],
    tones: ['Truyền cảm hứng', 'Chuyên gia giáo dục', 'Động viên', 'Rõ ràng'],
    audiences: ['Học viên đi làm', 'Phụ huynh', 'Sinh viên', 'Người chuyển nghề'],
    ctas: ['Đăng ký học thử', 'Nhận lộ trình học', 'Inbox tư vấn khóa học', 'Giữ suất ưu đãi'],
    hashtags: ['#GiaoDuc', '#HocTap', '#KhoaHoc', '#KyNang', '#Career'],
    productIdeas: [
      'Khóa online',
      'Lớp offline',
      'Gia sư',
      'Khóa kỹ năng',
      'Luyện thi',
      'Đào tạo doanh nghiệp',
      'Chứng chỉ',
    ],
  },
  'o-to-xe-may': {
    topics: ['Xe mới về', 'Bảo dưỡng định kỳ', 'So sánh mẫu xe', 'Ưu đãi trả góp', 'Tips sử dụng'],
    postTypes: [...POST_TYPES],
    tones: ['Chuyên gia', 'Thuyết phục', 'Rõ ràng'],
    audiences: ['Người mua xe lần đầu', 'Gia đình', 'Shipper / chạy dịch vụ'],
    ctas: ['Đặt lịch lái thử', 'Nhận bảng giá', 'Inbox tư vấn trả góp'],
    hashtags: ['#OTo', '#XeMay', '#LaiThu'],
    productIdeas: [
      'Xe máy mới',
      'Ô tô mới',
      'Xe cũ đã kiểm định',
      'Bảo dưỡng / sửa chữa',
      'Phụ tùng',
      'Bảo hiểm xe',
      'Trả góp xe',
    ],
  },
  'cong-nghe': {
    topics: [
      'Sản phẩm giải quyết đúng pain point',
      'So sánh cấu hình',
      'Ưu đãi theo mùa',
      'Hướng dẫn sử dụng',
      'Bảo hành / đổi trả',
    ],
    postTypes: [...POST_TYPES],
    tones: ['Chuyên gia', 'Rõ ràng', 'Thuyết phục'],
    audiences: ['Người mua điện thoại', 'Gia đình', 'Doanh nghiệp SME'],
    ctas: ['Xem cấu hình', 'Inbox hỏi giá', 'Nhận ưu đãi hôm nay'],
    hashtags: ['#DienMay', '#CongNghe', '#GiaDung'],
    productIdeas: [
      'Điện thoại',
      'Laptop',
      'TV / điện máy',
      'Đồ gia dụng',
      'Phụ kiện công nghệ',
      'Máy lạnh / máy giặt',
      'Gói bảo hành',
    ],
  },
  'sua-chua-ky-thuat': {
    topics: ['Sửa nhanh trong ngày', 'Checklist bảo trì', 'Case sửa thành công', 'Bảng giá tham khảo', 'Tips tránh hỏng'],
    postTypes: [...POST_TYPES],
    tones: ['Tin cậy', 'Rõ ràng', 'Gần gũi'],
    audiences: ['Hộ gia đình', 'Văn phòng', 'Chủ cửa hàng'],
    ctas: ['Gọi thợ ngay', 'Inbox báo lỗi', 'Đặt lịch bảo trì'],
    hashtags: ['#SuaChua', '#KyThuat', '#BaoTri'],
    productIdeas: [
      'Sửa điện nước',
      'Sửa điện lạnh',
      'Sửa máy giặt',
      'Sửa máy tính / laptop',
      'Bảo trì định kỳ',
      'Lắp đặt thiết bị',
    ],
  },
  'du-lich': {
    topics: ['Tour nổi bật', 'Tips chuẩn bị hành lý', 'Review điểm đến', 'Ưu đãi sớm', 'Lịch trình mẫu'],
    postTypes: [...POST_TYPES],
    tones: ['Truyền cảm hứng', 'Vui', 'Tin cậy'],
    audiences: ['Gia đình', 'Cặp đôi', 'Nhóm bạn', 'Doanh nghiệp team building'],
    ctas: ['Nhận lịch trình', 'Inbox đặt tour', 'Giữ chỗ ưu đãi'],
    hashtags: ['#DuLich', '#KhachSan', '#Tour'],
    productIdeas: [
      'Tour trong nước',
      'Tour quốc tế',
      'Khách sạn / resort',
      'Homestay',
      'Thuê xe du lịch',
      'Team building',
      'Combo nghỉ dưỡng',
    ],
  },
  'noi-that': {
    topics: ['Thiết kế không gian', 'Vật liệu bền đẹp', 'Trước/sau cải tạo', 'Báo giá minh bạch', 'Tips bố trí'],
    postTypes: [...POST_TYPES],
    tones: ['Chuyên gia', 'Thẩm mỹ', 'Tin cậy'],
    audiences: ['Gia đình sửa nhà', 'Chủ căn hộ mới', 'Văn phòng'],
    ctas: ['Nhận tư vấn thiết kế', 'Inbox báo giá', 'Đặt khảo sát'],
    hashtags: ['#NoiThat', '#ThietKe', '#XayDung'],
    productIdeas: [
      'Thiết kế nội thất',
      'Thi công nội thất',
      'Nội thất gỗ',
      'Sofa / giường tủ',
      'Cải tạo căn hộ',
      'Xây dựng / sửa chữa nhà',
    ],
  },
  // legacy aliases still used by old slugHint
  'am-thuc': {
    topics: ['Món signature', 'Combo giờ vàng', 'Review khách', 'Nguyên liệu', 'Không gian'],
    postTypes: [...POST_TYPES],
    tones: ['Gợi cảm giác', 'Vui', 'Gần gũi'],
    audiences: ['Nhóm bạn', 'Gia đình', 'Foodie'],
    ctas: ['Đặt bàn', 'Order ship', 'Inbox giữ chỗ'],
    hashtags: ['#AmThuc', '#Foodie'],
    productIdeas: ['Set menu', 'Món signature', 'Buffet', 'Đồ uống', 'Ship đồ ăn'],
  },
};

/** Map stable industry IDs → catalog slug (avoids Spa fallback when name missing). */
const ID_TO_SLUG: Record<string, string> = {
  [SPA_BEAUTY_INDUSTRY_ID]: 'spa-beauty',
  'cind0000-0000-4000-8000-000000000011': 'tham-my-vien',
  'cind0000-0000-4000-8000-000000000012': 'salon-toc-nail',
  'cind0000-0000-4000-8000-000000000013': 'nha-khoa',
  'cind0000-0000-4000-8000-000000000014': 'nha-hang',
  'cind0000-0000-4000-8000-000000000015': 'cafe-do-uong',
  'cind0000-0000-4000-8000-000000000016': 'thoi-trang-phu-kien',
  'cind0000-0000-4000-8000-000000000017': 'my-pham-cham-soc',
  'cind0000-0000-4000-8000-000000000006': 'bat-dong-san',
  'cind0000-0000-4000-8000-00000000000b': 'giao-duc',
  'cind0000-0000-4000-8000-000000000018': 'o-to-xe-may',
  'cind0000-0000-4000-8000-000000000005': 'cong-nghe',
  'cind0000-0000-4000-8000-000000000019': 'sua-chua-ky-thuat',
  'cind0000-0000-4000-8000-000000000008': 'du-lich',
  'cind0000-0000-4000-8000-00000000000e': 'noi-that',
};

function regulatedWarning(ctx: ReturnType<typeof resolveIndustryContext>): string | null {
  if (!ctx.isRegulated) return null;
  return `Ngành "${ctx.label}" thuộc nhóm nhạy cảm: nội dung sẽ được kiểm duyệt — không cam kết chữa khỏi / kết quả chắc chắn / gây hiểu nhầm.`;
}

function fallbackBundle(label: string): CatalogEntry {
  return {
    topics: [
      `Xu hướng mới trong ngành ${label}`,
      `Nỗi đau khách hàng ngành ${label}`,
      `Câu chuyện khách hàng thành công`,
      `Ưu đãi / chương trình nổi bật`,
      `Kiến thức giúp khách quyết định`,
    ],
    postTypes: [...POST_TYPES],
    tones: ['Chuyên gia', 'Thân thiện', 'Thuyết phục', 'Kể chuyện'],
    audiences: [
      `Khách hàng tiềm năng ngành ${label}`,
      'Người đang so sánh lựa chọn',
      'Khách cũ cần chăm sóc',
    ],
    ctas: ['Inbox tư vấn', 'Nhận báo giá', 'Đặt lịch tư vấn', 'Xem chi tiết ưu đãi'],
    hashtags: [
      `#${label.replace(/\s+/g, '')}`.slice(0, 30),
      '#ContentMarketing',
      '#BanHang',
      '#ThuongHieu',
    ],
    productIdeas: [
      `Sản phẩm chủ lực ngành ${label}`,
      `Gói dịch vụ ${label}`,
      'Combo ưu đãi',
      'Tư vấn / khảo sát',
    ],
  };
}

function resolveCatalogKey(input: IndustryFields): { ctx: ReturnType<typeof resolveIndustryContext>; key: string } {
  const ctx = resolveIndustryContext(input);
  const idKey = input.industryId ? ID_TO_SLUG[input.industryId] : undefined;
  const key = idKey || (ctx.isSpaBeauty ? 'spa-beauty' : ctx.slugHint);
  return { ctx, key };
}

export async function buildIndustrySuggestions(
  input: IndustryFields & { forceAi?: boolean },
  openai?: OpenAiService,
): Promise<IndustrySuggestionBundle> {
  const { ctx, key } = resolveCatalogKey(input);
  const catalog = CATALOG[key];
  const warning = regulatedWarning(ctx);

  if (catalog && !ctx.isCustom && !input.forceAi) {
    return {
      industry: ctx.label,
      industryId: input.industryId ?? null,
      slug: key,
      isCustom: false,
      isRegulated: ctx.isRegulated,
      regulatedWarning: warning,
      ...catalog,
      source: 'catalog',
    };
  }

  if (openai?.isConfigured()) {
    try {
      const { block } = buildFullIndustryPromptContext({
        industry: input,
        productService: ctx.label,
        goal: 'gợi ý content đa dạng',
        platform: 'facebook',
      });
      const prompt = `${block}

Trả JSON thuần (không markdown):
{
  "topics": ["...5 chủ đề"],
  "tones": ["...4 giọng"],
  "audiences": ["...4 đối tượng"],
  "ctas": ["...4 CTA"],
  "hashtags": ["#Tag1","#Tag2","#Tag3","#Tag4"],
  "productIdeas": ["...8–10 sản phẩm/dịch vụ đúng ngành"]
}
Yêu cầu: thuật ngữ đúng ngành "${ctx.label}"; tuyệt đối không dùng spa/làm đẹp nếu ngành không phải Spa/Làm đẹp.`;
      const raw = await openai.chatCompletion({
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 900,
        temperature: 0.7,
      });
      const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()) as Partial<
        IndustrySuggestionBundle
      >;
      const base = fallbackBundle(ctx.label);
      return {
        industry: ctx.label,
        industryId: input.industryId ?? null,
        slug: key,
        isCustom: ctx.isCustom,
        isRegulated: ctx.isRegulated,
        regulatedWarning: warning,
        topics: Array.isArray(parsed.topics) && parsed.topics.length ? parsed.topics.slice(0, 8) : base.topics,
        postTypes: [...POST_TYPES],
        tones: Array.isArray(parsed.tones) && parsed.tones.length ? parsed.tones.slice(0, 6) : base.tones,
        audiences:
          Array.isArray(parsed.audiences) && parsed.audiences.length
            ? parsed.audiences.slice(0, 6)
            : base.audiences,
        ctas: Array.isArray(parsed.ctas) && parsed.ctas.length ? parsed.ctas.slice(0, 6) : base.ctas,
        hashtags:
          Array.isArray(parsed.hashtags) && parsed.hashtags.length
            ? parsed.hashtags.slice(0, 8)
            : base.hashtags,
        productIdeas:
          Array.isArray(parsed.productIdeas) && parsed.productIdeas.length
            ? parsed.productIdeas.slice(0, 12)
            : base.productIdeas,
        source: 'ai',
      };
    } catch {
      /* fallback below */
    }
  }

  const base = catalog ?? fallbackBundle(ctx.label);
  return {
    industry: ctx.label,
    industryId: input.industryId ?? null,
    slug: key,
    isCustom: ctx.isCustom,
    isRegulated: ctx.isRegulated,
    regulatedWarning: warning,
    ...base,
    source: catalog ? 'catalog' : 'fallback',
  };
}
