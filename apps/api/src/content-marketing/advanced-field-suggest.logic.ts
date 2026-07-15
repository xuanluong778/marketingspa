import type { OpenAiService } from '../openai/openai.service';
import {
  ADVANCED_SUGGEST_FIELD_LABELS,
  DEMOGRAPHIC_LABELS,
  type AdvancedSuggestField,
} from './advanced-article-config';

export interface AdvancedFieldSuggestion {
  options: string[];
  source: 'ai' | 'template';
}

function productCategory(product: string): 'skin' | 'massage' | 'slim' | 'beauty' | 'general' {
  const lower = product.toLowerCase();
  if (/da|spa|trẻ hóa|facial|skincare|mụn|lỗ chân lông|nám|tàn nhang/i.test(lower)) return 'skin';
  if (/massage|thư giãn|body|gội|đá nóng/i.test(lower)) return 'massage';
  if (/giảm cân|slim|eo|dáng|fit|mỡ/i.test(lower)) return 'slim';
  if (/nail|mi|lash|phun xăm|làm đẹm|nhuộm/i.test(lower)) return 'beauty';
  return 'general';
}

function templateOptions(
  field: AdvancedSuggestField,
  product: string,
  demographic?: string,
  painPoints?: string,
): string[] {
  const cat = productCategory(product);
  const demo = demographic && demographic in DEMOGRAPHIC_LABELS
    ? DEMOGRAPHIC_LABELS[demographic as keyof typeof DEMOGRAPHIC_LABELS]
    : '';

  const skinPain = [
    'Da nám xỉn, makeup không che được, tự ti khi giao tiếp',
    'Lỗ chân lông to, da dầu bóng, makeup trôi nhanh giữa ngày',
    'Thử nhiều serum nhưng da vẫn xỉn, không đều màu',
    'Nám tăng sẫm sau sinh, lo lắng da lão hóa sớm',
    'Da nhạy cảm, sợ kích ứng khi làm liệu trình mới',
  ];
  const massagePain = [
    'Mỏi vai gáy, căng cơ sau ngồi máy cả ngày, khó ngủ sâu',
    'Stress công việc, cơ thể luôn mệt nhưng không có thời gian nghỉ',
    'Đau lưng, cứng cổ — uống thuốc giảm đau không còn hiệu quả',
    'Mất ngủ kéo dài, da xanh xao, thiếu năng lượng',
    'Hay đau đầu do căng cơ, cần giải pháp thư giãn định kỳ',
  ];
  const slimPain = [
    'Mỡ bụng tích tụ, mặc đồ bó sát không tự tin',
    'Đã thử ăn kiêng nhiều lần nhưng dễ tăng cân lại',
    'Vòng eo to, khó mặc váy/áo ôm như mong muốn',
    'Cellulite đùi/mông, ngại mặc quần short',
    'Bận rộn, khó duy trì tập gym đều đặn',
  ];
  const generalPain = [
    'Khó tìm spa uy tín, lo ngại không đúng cam kết',
    'Đã thử nhiều nơi nhưng chưa hài lòng với kết quả',
    'Thiếu thời gian chăm sóc bản thân giữa lịch bận rộn',
    'Không biết chọn liệu trình phù hợp cơ địa',
    'Lo chi phí cao nhưng hiệu quả không rõ ràng',
  ];

  const skinDesire = [
    'Da sáng đều, tự tin không cần che khuyết điểm dày',
    'Makeup ăn nền, da mịn và căng bóng tự nhiên',
    'Giảm nám/mụn thấy rõ, da đều màu hơn sau liệu trình',
    'Da khỏe từ bên trong, ít tái phát vấn đề cũ',
    'Trông trẻ trung hơn tuổi thật, tự tin chụp ảnh không filter',
  ];
  const massageDesire = [
    'Cơ thể nhẹ nhõm, ngủ ngon, sáng dậy full năng lượng',
    'Giảm đau vai gáy rõ rệt sau vài buổi',
    'Thư giãn sâu, giảm stress, tâm trạng ổn định hơn',
    'Có thói quen chăm sóc bản thân định kỳ, dễ duy trì',
    'Tái tạo nhanh sau tuần làm việc căng thẳng',
  ];
  const slimDesire = [
    'Vòng eo thon hơn, mặc đồ ôm tự tin',
    'Giảm số đo có căn cứ, không cần nhịn ăn quá gắt',
    'Vóc dáng săn chắc, da căng mịn hơn',
    'Quy trình an toàn, phù hợp người bận rộn',
    'Tự tin hơn khi đi biển, chụp ảnh full body',
  ];
  const generalDesire = [
    'Trải nghiệm dịch vụ chuyên nghiệp, cảm thấy được chăm sóc',
    'Kết quả cải thiện rõ, xứng đáng với chi phí bỏ ra',
    'Tiết kiệm thời gian — quy trình gọn, đặt lịch linh hoạt',
    'An tâm về chất lượng, minh bạch quy trình',
    'Tự tin hơn về ngoại hình và sức khỏe',
  ];

  const diffOptions = [
    `Chuyên viên 8+ năm kinh nghiệm, máy công nghệ Hàn, không gian riêng tư`,
    `Quy trình chuẩn spa quốc tế, sản phẩm có nguồn gốc rõ ràng, không chen lịch`,
    `Tư vấn 1-1 theo cơ địa trước liệu trình — không bán gói không phù hợp`,
    `Không gian premium, phòng riêng, playlist thư giãn — trải nghiệm cao cấp`,
    `Đội ngũ được đào tạo bài bản, cập nhật công nghệ mới định kỳ`,
    `Đặt lịch linh hoạt, nhắc lịch Zalo, hỗ trợ sau liệu trình tận tâm`,
  ];

  const certOptions = [
    'Quy trình chuẩn spa, sản phẩm có nguồn gốc rõ ràng, không pha trộn',
    'Chuyên viên được đào tạo chứng chỉ nghề, vệ sinh dụng cụ theo chuẩn',
    'Cam kết tư vấn trung thực — không hứa hẹn 100%, có disclaimer phù hợp cơ địa',
    'Bảo hành / hỗ trợ điều chỉnh liệu trình nếu da/cơ thể phản ứng bất thường',
    'Spa đạt tiêu chuẩn vệ sinh, máy móc bảo trì định kỳ, hóa đơn minh bạch',
    'Không ép mua thêm gói — khách được giải thích rõ từng bước trước khi làm',
  ];

  const caseStudySkin = [
    'Chị Lan (35 tuổi) sau 6 buổi thấy da sáng hơn, vết nám mờ dần (tùy cơ địa)',
    'Chị Hương (32 tuổi, sau sinh) — nám giảm rõ sau 8 buổi, tự tin makeup nhẹ',
    'Chị Mai (40 tuổi) da lão hóa — sau liệu trình da căng hơn, đồng nghiệp hỏi bí quyết',
    'Chị Trang (28 tuổi) mụn ẩn giảm, da mịn hơn sau 4 buổi chăm sóc chuyên sâu',
    'Chị Ngọc (38 tuổi) — da đều màu hơn, ít phải che khuyết điểm khi đi làm',
  ];
  const caseStudyMassage = [
    'Anh Tuấn (34 tuổi, văn phòng) — giảm đau vai gáy sau 3 buổi, ngủ ngon hơn',
    'Chị Linh (29 tuổi) stress cao — sau massage body cảm thấy nhẹ người, tâm trạng ổn',
    'Chị Phương (42 tuổi) hay mất ngủ — sau 5 buổi ngủ sâu hơn, da sáng lại',
  ];
  const caseStudyGeneral = [
    'Khách hàng quen (30 tuổi) quay lại vì hài lòng quy trình và thái độ phục vụ',
    'Chị Vy (36 tuổi) lần đầu thử — ấn tượng tư vấn chi tiết, không ép mua thêm',
    'Khách premium (45 tuổi) đánh giá cao không gian riêng tư và chuyên viên kinh nghiệm',
  ];

  const pick = <T>(arr: T[], n = 5): T[] => arr.slice(0, n);

  if (field === 'painPoints') {
    const base =
      cat === 'skin' ? skinPain : cat === 'massage' ? massagePain : cat === 'slim' ? slimPain : generalPain;
    return pick(demo ? base.map((b) => `${b}`) : base);
  }
  if (field === 'desires') {
    const base =
      cat === 'skin' ? skinDesire : cat === 'massage' ? massageDesire : cat === 'slim' ? slimDesire : generalDesire;
    return pick(base);
  }
  if (field === 'differentiator') {
    const tagged = diffOptions.map((d) => (product ? d.replace('spa', product) : d));
    return pick(tagged);
  }
  if (field === 'certification') {
    return pick(certOptions);
  }
  if (field === 'caseStudy') {
    const base =
      cat === 'skin' ? caseStudySkin : cat === 'massage' ? caseStudyMassage : caseStudyGeneral;
    const withProduct = base.map((c) => c.replace(/liệu trình|buổi chăm sóc/gi, (m) => `${m} ${product}`.trim()));
    return pick(withProduct);
  }

  return [];
}

export function templateSuggestAdvancedField(dto: {
  field: AdvancedSuggestField;
  productService: string;
  demographic?: string;
  painPoints?: string;
}): AdvancedFieldSuggestion {
  const options = templateOptions(
    dto.field,
    dto.productService.trim(),
    dto.demographic,
    dto.painPoints,
  );
  return { options, source: 'template' };
}

export async function suggestAdvancedField(
  dto: {
    field: AdvancedSuggestField;
    productService: string;
    demographic?: string;
    articleGoal?: string;
    writingStyle?: string;
    painPoints?: string;
    currentValue?: string;
  },
  openai?: OpenAiService,
): Promise<AdvancedFieldSuggestion> {
  const fallback = templateSuggestAdvancedField(dto);

  if (!openai?.isConfigured()) {
    return fallback;
  }

  const fieldLabel = ADVANCED_SUGGEST_FIELD_LABELS[dto.field];
  const demo =
    dto.demographic && dto.demographic in DEMOGRAPHIC_LABELS
      ? DEMOGRAPHIC_LABELS[dto.demographic as keyof typeof DEMOGRAPHIC_LABELS]
      : 'chưa chọn';

  const prompt = `Bạn là copywriter marketing spa/wellness tại Việt Nam.
Gợi ý 5 lựa chọn KHÁC NHAU cho trường "${fieldLabel}" khi viết bài bán hàng spa.

Dịch vụ/sản phẩm: ${dto.productService}
Nhân khẩu học: ${demo}
Mục tiêu bài: ${dto.articleGoal ?? 'bán hàng'}
${dto.painPoints ? `Nỗi đau khách (tham khảo): ${dto.painPoints.slice(0, 200)}` : ''}
${dto.currentValue ? `Giá trị hiện tại (tránh trùng): ${dto.currentValue.slice(0, 150)}` : ''}

Yêu cầu:
- Mỗi option 1–2 câu, tiếng Việt tự nhiên, cụ thể với dịch vụ trên
- Không cam kết 100%, không y khoa tuyệt đối
- caseStudy: có tên tuổi giả định, ghi (tùy cơ địa) nếu nói kết quả
- certification: cam kết thực tế spa có thể đưa ra
- 5 option phải khác góc nhìn, không lặp ý

Trả JSON (không markdown):
{"options":["opt1","opt2","opt3","opt4","opt5"]}`;

  try {
    const raw = await openai.chatCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 700,
      temperature: 0.75,
    });
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()) as { options?: string[] };
    const options = Array.isArray(parsed.options)
      ? parsed.options.map((o) => String(o).trim()).filter(Boolean).slice(0, 5)
      : [];
    if (options.length >= 3) {
      return { options, source: 'ai' };
    }
    return fallback;
  } catch {
    return fallback;
  }
}
