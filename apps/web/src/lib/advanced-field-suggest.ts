import type { AdvancedFieldSuggestion, AdvancedSuggestField } from '@/types/content-marketing';

function productCategory(product: string): 'skin' | 'massage' | 'slim' | 'general' {
  const lower = product.toLowerCase();
  if (/da|spa|trẻ hóa|facial|skincare|mụn|nám/i.test(lower)) return 'skin';
  if (/massage|thư giãn|body|gội/i.test(lower)) return 'massage';
  if (/giảm cân|slim|eo|dáng|mỡ/i.test(lower)) return 'slim';
  return 'general';
}

/** Fallback offline khi API lỗi */
export function suggestAdvancedFieldLocal(input: {
  field: AdvancedSuggestField;
  productService: string;
}): AdvancedFieldSuggestion {
  const cat = productCategory(input.productService);
  const p = input.productService.trim();

  const byField: Record<AdvancedSuggestField, Record<string, string[]>> = {
    painPoints: {
      skin: [
        'Da nám xỉn, makeup không che được, tự ti khi giao tiếp',
        'Lỗ chân lông to, da dầu bóng, makeup trôi nhanh',
        'Thử nhiều serum nhưng da vẫn không đều màu',
        'Nám tăng sẫm sau sinh, lo da lão hóa sớm',
        'Da nhạy cảm, sợ kích ứng khi thử liệu trình mới',
      ],
      massage: [
        'Mỏi vai gáy, căng cơ sau ngồi máy cả ngày',
        'Stress công việc, khó ngủ sâu, cơ thể luôn mệt',
        'Đau lưng cứng cổ — uống thuốc giảm đau không hiệu quả lâu dài',
        'Hay đau đầu do căng cơ, cần thư giãn định kỳ',
        'Thiếu thời gian nghỉ ngơi, cơ thể báo mệt liên tục',
      ],
      slim: [
        'Mỡ bụng tích tụ, mặc đồ bó không tự tin',
        'Đã thử ăn kiêng nhiều lần nhưng dễ tăng cân lại',
        'Vòng eo to, khó mặc váy/áo ôm',
        'Bận rộn, khó duy trì tập gym đều',
        'Cellulite đùi/mông, ngại mặc quần short',
      ],
      general: [
        'Khó tìm spa uy tín, lo không đúng cam kết',
        'Đã thử nhiều nơi nhưng chưa hài lòng',
        'Thiếu thời gian chăm sóc bản thân',
        'Không biết chọn liệu trình phù hợp cơ địa',
        'Lo chi phí cao nhưng hiệu quả không rõ',
      ],
    },
    desires: {
      skin: [
        'Da sáng đều, tự tin không cần che khuyết điểm dày',
        'Makeup ăn nền, da mịn căng bóng tự nhiên',
        'Giảm nám/mụn thấy rõ sau liệu trình (tùy cơ địa)',
        'Da khỏe, ít tái phát vấn đề cũ',
        'Trông trẻ trung hơn, tự tin chụp ảnh không filter',
      ],
      massage: [
        'Cơ thể nhẹ nhõm, ngủ ngon, sáng dậy full năng lượng',
        'Giảm đau vai gáy rõ sau vài buổi',
        'Thư giãn sâu, giảm stress hàng ngày',
        'Có thói quen chăm sóc bản thân dễ duy trì',
        'Tái tạo nhanh sau tuần làm việc căng thẳng',
      ],
      slim: [
        'Vòng eo thon hơn, mặc đồ ôm tự tin',
        'Giảm số đo có căn cứ, không cần nhịn ăn quá gắt',
        'Vóc dáng săn chắc, da căng mịn hơn',
        'Quy trình an toàn, phù hợp người bận rộn',
        'Tự tin hơn khi đi biển, chụp ảnh full body',
      ],
      general: [
        'Trải nghiệm chuyên nghiệp, cảm thấy được chăm sóc',
        'Kết quả cải thiện rõ, xứng đáng chi phí',
        'Tiết kiệm thời gian — quy trình gọn, đặt lịch linh hoạt',
        'An tâm về chất lượng, minh bạch quy trình',
        'Tự tin hơn về ngoại hình và sức khỏe',
      ],
    },
    differentiator: {
      skin: [
        `Chuyên viên 8+ năm kinh nghiệm, máy công nghệ Hàn cho ${p}`,
        'Quy trình chuẩn spa quốc tế, sản phẩm nguồn gốc rõ ràng',
        'Tư vấn 1-1 theo cơ địa — không bán gói không phù hợp',
        'Không gian premium, phòng riêng, không chen lịch',
        'Đội ngũ đào tạo bài bản, cập nhật công nghệ mới',
      ],
      massage: [],
      slim: [],
      general: [],
    },
    certification: {
      skin: [
        'Quy trình chuẩn spa, sản phẩm có nguồn gốc rõ ràng',
        'Chuyên viên chứng chỉ nghề, vệ sinh dụng cụ theo chuẩn',
        'Cam kết tư vấn trung thực — không hứa 100%, có disclaimer cơ địa',
        'Hỗ trợ điều chỉnh liệu trình nếu da phản ứng bất thường',
        'Máy móc bảo trì định kỳ, hóa đơn minh bạch',
      ],
      massage: [],
      slim: [],
      general: [],
    },
    caseStudy: {
      skin: [
        'Chị Lan (35 tuổi) sau 6 buổi thấy da sáng hơn, vết nám mờ dần (tùy cơ địa)',
        'Chị Hương (32 tuổi, sau sinh) — nám giảm rõ sau 8 buổi, tự tin makeup nhẹ',
        'Chị Mai (40 tuổi) — da căng hơn, đồng nghiệp hỏi bí quyết',
        'Chị Trang (28 tuổi) mụn ẩn giảm, da mịn hơn sau 4 buổi',
        'Chị Ngọc (38 tuổi) — da đều màu, ít phải che khuyết điểm khi đi làm',
      ],
      massage: [
        'Anh Tuấn (34 tuổi, văn phòng) — giảm đau vai gáy sau 3 buổi',
        'Chị Linh (29 tuổi) — sau massage body cảm thấy nhẹ người, tâm trạng ổn',
        'Chị Phương (42 tuổi) — ngủ sâu hơn sau 5 buổi, da sáng lại',
        'Anh Minh (31 tuổi) — giảm căng cơ, tập trung làm việc tốt hơn',
        'Chị Thảo (36 tuổi) — hết mỏi lưng sau liệu trình body định kỳ',
      ],
      slim: [
        'Chị Vy (33 tuổi) — giảm 3cm vòng eo sau liệu trình (tùy cơ địa)',
        'Chị Hà (29 tuổi) — mặc lại váy cũ tự tin hơn sau 8 buổi',
        'Chị Loan (38 tuổi) — vóc dáng săn hơn, không cần nhịn ăn quá gắt',
        'Chị Nhi (27 tuổi) — giảm mỡ bụng rõ, tự tin đi biển',
        'Chị Thu (35 tuổi) — duy trì số đo ổn định nhờ quy trình có hướng dẫn',
      ],
      general: [
        'Khách hàng quen (30 tuổi) quay lại vì hài lòng quy trình và phục vụ',
        'Chị Vy (36 tuổi) — ấn tượng tư vấn chi tiết, không ép mua thêm',
        'Khách premium (45 tuổi) đánh giá cao không gian riêng tư',
        'Chị Kim (34 tuổi) — lần đầu thử, cảm thấy an tâm từ bước tư vấn',
        'Anh Đức (32 tuổi) — quy trình rõ ràng, đúng hẹn, không chờ lâu',
      ],
    },
  };

  const fieldMap = byField[input.field];
  let options: string[] =
    (fieldMap[cat]?.length ? fieldMap[cat] : fieldMap.general) ?? [];

  if (input.field === 'differentiator' && (!options.length || cat !== 'skin')) {
    options = [
      `Chuyên viên 8+ năm kinh nghiệm, máy công nghệ Hàn cho ${p}`,
      'Quy trình chuẩn spa, sản phẩm nguồn gốc rõ ràng, không chen lịch',
      'Tư vấn 1-1 theo cơ địa trước liệu trình',
      'Không gian riêng tư premium, đặt lịch linh hoạt',
      'Đội ngũ đào tạo bài bản, hỗ trợ sau liệu trình tận tâm',
    ];
  }
  if (input.field === 'certification' && (!options.length || cat !== 'skin')) {
    options = [
      'Quy trình chuẩn spa, sản phẩm có nguồn gốc rõ ràng',
      'Chuyên viên chứng chỉ nghề, vệ sinh dụng cụ theo chuẩn',
      'Cam kết tư vấn trung thực — không hứa 100%',
      'Hỗ trợ điều chỉnh liệu trình khi cần',
      'Máy móc bảo trì định kỳ, minh bạch chi phí',
    ];
  }

  return { options: options.slice(0, 5), source: 'template' };
}
