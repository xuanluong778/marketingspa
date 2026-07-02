export interface ChatbotSuggestOption {
  value: string;
  label: string;
  description?: string;
}

export const CHATBOT_INDUSTRY_OPTIONS: ChatbotSuggestOption[] = [
  { value: 'Spa / Thẩm mỹ', label: 'Spa / Thẩm mỹ' },
  { value: 'Da liễu thẩm mỹ', label: 'Da liễu thẩm mỹ' },
  { value: 'Nha khoa thẩm mỹ', label: 'Nha khoa thẩm mỹ' },
  { value: 'Phòng khám đa khoa', label: 'Phòng khám đa khoa' },
  { value: 'Massage & wellness', label: 'Massage & wellness' },
  { value: 'Nail & mi', label: 'Nail & mi' },
  { value: 'Tóc & barber', label: 'Tóc & barber' },
  { value: 'Fitness / yoga / pilates', label: 'Fitness / yoga / pilates' },
  { value: 'Khách sạn & resort', label: 'Khách sạn & resort' },
  { value: 'F&B / nhà hàng', label: 'F&B / nhà hàng' },
  { value: 'Bất động sản', label: 'Bất động sản' },
  { value: 'Giáo dục / đào tạo', label: 'Giáo dục / đào tạo' },
  { value: 'Thời trang & mỹ phẩm', label: 'Thời trang & mỹ phẩm' },
  { value: 'Công nghệ / SaaS', label: 'Công nghệ / SaaS' },
  { value: 'Khác', label: 'Khác (nhập tay)' },
];

export const CHATBOT_SERVICE_OPTIONS: Record<string, string[]> = {
  'Spa / Thẩm mỹ': [
    'Chăm sóc da mặt cơ bản & chuyên sâu',
    'Trị mụn, nám, tàn nhang',
    'Triệt lông công nghệ cao',
    'Gội đầu dưỡng sinh, massage body',
    'Liệu trình detox, slimming',
    'Bán mỹ phẩm chính hãng',
  ],
  'Da liễu thẩm mỹ': [
    'Khám và điều trị mụn',
    'Laser trị nám, sẹo',
    'Tiêm filler/botox',
    'Peel da, mesotherapy',
  ],
  'Nha khoa thẩm mỹ': [
    'Tẩy trắng răng',
    'Niềng răng trong suốt',
    'Trồng răng implant',
    'Nhổ răng khôn, bọc sứ',
  ],
  'Massage & wellness': [
    'Massage body thư giãn',
    'Massage trị liệu đau vai gáy',
    'Xông hơi, tắm khoáng',
    'Liệu trình giảm mỡ',
  ],
  default: [
    'Tư vấn dịch vụ chính',
    'Báo giá & đặt lịch hẹn',
    'Chăm sóc khách hàng sau bán',
    'Chương trình khuyến mãi',
    'Hỗ trợ khiếu nại / đổi trả',
  ],
};

export function servicesForIndustry(industry?: string): string[] {
  if (!industry) return CHATBOT_SERVICE_OPTIONS.default ?? [];
  return CHATBOT_SERVICE_OPTIONS[industry] ?? CHATBOT_SERVICE_OPTIONS.default ?? [];
}
