export interface SelectOption {
  value: string;
  label: string;
  placeholder?: string;
}

export const REVENUE_TYPE_OPTIONS: SelectOption[] = [
  { value: 'SKIN_CARE', label: 'Dịch vụ chăm sóc da' },
  { value: 'ACNE', label: 'Dịch vụ trị mụn' },
  { value: 'MELASMA', label: 'Dịch vụ nám/tàn nhang' },
  { value: 'HAIR_REMOVAL', label: 'Dịch vụ triệt lông' },
  { value: 'HEAD_SPA', label: 'Dịch vụ gội đầu dưỡng sinh' },
  { value: 'COMBO', label: 'Combo liệu trình' },
  { value: 'COSMETICS', label: 'Bán mỹ phẩm' },
  { value: 'OTHER', label: 'Khác' },
];

export const VARIABLE_COST_OPTIONS: SelectOption[] = [
  { value: 'COSMETICS_USED', label: 'Mỹ phẩm', placeholder: 'Ví dụ: 200.000' },
  { value: 'CONSUMABLES', label: 'Vật tư tiêu hao', placeholder: 'Ví dụ: 50.000' },
  { value: 'HYGIENE', label: 'Khăn/bông/găng tay', placeholder: 'Ví dụ: 30.000' },
  { value: 'COMMISSION', label: 'Hoa hồng kỹ thuật viên', placeholder: 'Ví dụ: 300.000' },
  { value: 'PAYMENT_FEE', label: 'Phí thanh toán', placeholder: 'Ví dụ: 15.000' },
  { value: 'GIFT', label: 'Quà tặng khách hàng', placeholder: 'Ví dụ: 50.000' },
  { value: 'OTHER', label: 'Khác', placeholder: 'Ví dụ: 100.000' },
];

export const FIXED_COST_OPTIONS: SelectOption[] = [
  { value: 'RENT', label: 'Tiền mặt bằng', placeholder: 'Ví dụ: 25.000.000' },
  { value: 'ELECTRICITY', label: 'Tiền điện', placeholder: 'Ví dụ: 5.000.000' },
  { value: 'WATER', label: 'Tiền nước', placeholder: 'Ví dụ: 1.000.000' },
  { value: 'STAFF_SALARY', label: 'Lương nhân viên', placeholder: 'Ví dụ: 40.000.000' },
  { value: 'MANAGER_SALARY', label: 'Lương quản lý', placeholder: 'Ví dụ: 15.000.000' },
  { value: 'SOFTWARE', label: 'Phần mềm', placeholder: 'Ví dụ: 1.000.000' },
  { value: 'INTERNET', label: 'Internet', placeholder: 'Ví dụ: 500.000' },
  { value: 'DEPRECIATION', label: 'Khấu hao máy móc', placeholder: 'Ví dụ: 3.000.000' },
  { value: 'MAINTENANCE', label: 'Bảo trì', placeholder: 'Ví dụ: 1.500.000' },
  { value: 'TAX', label: 'Thuế/phí', placeholder: 'Ví dụ: 2.000.000' },
  { value: 'OTHER', label: 'Khác', placeholder: 'Ví dụ: 1.000.000' },
];

export const MARKETING_COST_OPTIONS: SelectOption[] = [
  { value: 'FACEBOOK_ADS', label: 'Facebook Ads', placeholder: 'Ví dụ: 15.000.000' },
  { value: 'GOOGLE_ADS', label: 'Google Ads', placeholder: 'Ví dụ: 5.000.000' },
  { value: 'TIKTOK_ADS', label: 'TikTok Ads', placeholder: 'Ví dụ: 8.000.000' },
  { value: 'ZALO_ADS', label: 'Zalo Ads', placeholder: 'Ví dụ: 3.000.000' },
  { value: 'KOL', label: 'KOL/KOC', placeholder: 'Ví dụ: 10.000.000' },
  { value: 'PHOTO_VIDEO', label: 'Quay video/chụp ảnh', placeholder: 'Ví dụ: 5.000.000' },
  { value: 'CONTENT', label: 'Thiết kế content', placeholder: 'Ví dụ: 3.000.000' },
  { value: 'SEO', label: 'SEO website', placeholder: 'Ví dụ: 4.000.000' },
  { value: 'PRINT', label: 'Voucher/tờ rơi', placeholder: 'Ví dụ: 2.000.000' },
  { value: 'RETENTION', label: 'Chăm sóc khách cũ', placeholder: 'Ví dụ: 5.000.000' },
  { value: 'OTHER', label: 'Khác', placeholder: 'Ví dụ: 2.000.000' },
];

export const LEAD_SOURCE_OPTIONS: SelectOption[] = [
  { value: 'FACEBOOK', label: 'Facebook' },
  { value: 'GOOGLE', label: 'Google' },
  { value: 'TIKTOK', label: 'TikTok' },
  { value: 'ZALO', label: 'Zalo' },
  { value: 'WEBSITE', label: 'Website' },
  { value: 'SEO', label: 'SEO' },
  { value: 'REFERRAL', label: 'Khách giới thiệu' },
  { value: 'RETURNING', label: 'Khách cũ quay lại' },
  { value: 'OFFLINE', label: 'Offline' },
  { value: 'OTHER', label: 'Khác' },
];

export const GOAL_TYPE_OPTIONS: SelectOption[] = [
  { value: 'BREAK_EVEN', label: 'Mục tiêu hòa vốn' },
  { value: 'LIGHT_PROFIT', label: 'Mục tiêu có lãi nhẹ' },
  { value: 'GROWTH', label: 'Mục tiêu tăng trưởng' },
  { value: 'EXPANSION', label: 'Mục tiêu mở rộng chi nhánh' },
  { value: 'COST_OPTIMIZE', label: 'Mục tiêu tối ưu chi phí' },
  { value: 'OTHER', label: 'Khác' },
];

export function getOptionPlaceholder(
  options: SelectOption[],
  category: string,
  fallback = 'Ví dụ: 1.000.000',
): string {
  return options.find((o) => o.value === category)?.placeholder ?? fallback;
}
