export const CHATBOT_INDUSTRY_OPTIONS = [
  'Spa / Thẩm mỹ',
  'Da liễu thẩm mỹ',
  'Nha khoa thẩm mỹ',
  'Phòng khám đa khoa',
  'Massage & wellness',
  'Nail & mi',
  'Tóc & barber',
  'Fitness / yoga / pilates',
  'Khách sạn & resort',
  'F&B / nhà hàng',
  'Bất động sản',
  'Giáo dục / đào tạo',
  'Thời trang & mỹ phẩm',
  'Công nghệ / SaaS',
] as const;

export const CHATBOT_SERVICES_BY_INDUSTRY: Record<string, string[]> = {
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
};

export const CHATBOT_DEFAULT_SERVICES = [
  'Tư vấn dịch vụ chính',
  'Báo giá & đặt lịch hẹn',
  'Chăm sóc khách hàng sau bán',
  'Chương trình khuyến mãi',
];

export function servicesForIndustry(industry?: string): string[] {
  if (!industry) return CHATBOT_DEFAULT_SERVICES;
  return CHATBOT_SERVICES_BY_INDUSTRY[industry] ?? CHATBOT_DEFAULT_SERVICES;
}
