export const AUTOPILOT_GOALS = [
  { id: 'tang-lead', label: 'Tăng Lead' },
  { id: 'tang-booking', label: 'Tăng Booking' },
  { id: 'tang-doanh-thu', label: 'Tăng doanh thu' },
  { id: 'khach-moi', label: 'Khách mới' },
  { id: 'remarketing', label: 'Remarketing' },
  { id: 'khach-cu', label: 'Khách cũ' },
  { id: 'ra-mat-san-pham', label: 'Ra mắt sản phẩm' },
  { id: 'nhan-dien', label: 'Nhận diện' },
] as const;

export const AUTOPILOT_BUDGET_PRESETS = [
  { id: '5tr', label: '5 triệu', amount: 5_000_000 },
  { id: '10tr', label: '10 triệu', amount: 10_000_000 },
  { id: '20tr', label: '20 triệu', amount: 20_000_000 },
  { id: '50tr', label: '50 triệu', amount: 50_000_000 },
] as const;

export const VN_PROVINCES: Array<{ name: string; aliases: string[] }> = [
  { name: 'Hà Nội', aliases: ['ha noi', 'hn'] },
  { name: 'TP.HCM', aliases: ['ho chi minh', 'hcm', 'sài gòn', 'sai gon', 'thành phố hồ chí minh', 'tphcm'] },
  { name: 'Đà Nẵng', aliases: ['da nang', 'dn'] },
  { name: 'Hải Phòng', aliases: ['hai phong'] },
  { name: 'Cần Thơ', aliases: ['can tho'] },
  { name: 'An Giang', aliases: [] },
  { name: 'Bà Rịa - Vũng Tàu', aliases: ['vung tau', 'ba ria', 'brvt'] },
  { name: 'Bắc Giang', aliases: [] },
  { name: 'Bắc Kạn', aliases: ['bac kan', 'bac can'] },
  { name: 'Bạc Liêu', aliases: [] },
  { name: 'Bắc Ninh', aliases: [] },
  { name: 'Bến Tre', aliases: [] },
  { name: 'Bình Định', aliases: [] },
  { name: 'Bình Dương', aliases: [] },
  { name: 'Bình Phước', aliases: [] },
  { name: 'Bình Thuận', aliases: [] },
  { name: 'Cà Mau', aliases: [] },
  { name: 'Cao Bằng', aliases: [] },
  { name: 'Đắk Lắk', aliases: ['dak lak', 'dac lac'] },
  { name: 'Đắk Nông', aliases: ['dak nong'] },
  { name: 'Điện Biên', aliases: [] },
  { name: 'Đồng Nai', aliases: [] },
  { name: 'Đồng Tháp', aliases: [] },
  { name: 'Gia Lai', aliases: [] },
  { name: 'Hà Giang', aliases: [] },
  { name: 'Hà Nam', aliases: [] },
  { name: 'Hà Tĩnh', aliases: [] },
  { name: 'Hải Dương', aliases: [] },
  { name: 'Hậu Giang', aliases: [] },
  { name: 'Hòa Bình', aliases: [] },
  { name: 'Hưng Yên', aliases: [] },
  { name: 'Khánh Hòa', aliases: ['nha trang'] },
  { name: 'Kiên Giang', aliases: ['phu quoc'] },
  { name: 'Kon Tum', aliases: [] },
  { name: 'Lai Châu', aliases: [] },
  { name: 'Lâm Đồng', aliases: ['da lat', 'đà lạt'] },
  { name: 'Lạng Sơn', aliases: [] },
  { name: 'Lào Cai', aliases: ['sa pa', 'sapa'] },
  { name: 'Long An', aliases: [] },
  { name: 'Nam Định', aliases: [] },
  { name: 'Nghệ An', aliases: ['vinh'] },
  { name: 'Ninh Bình', aliases: [] },
  { name: 'Ninh Thuận', aliases: [] },
  { name: 'Phú Thọ', aliases: [] },
  { name: 'Phú Yên', aliases: [] },
  { name: 'Quảng Bình', aliases: [] },
  { name: 'Quảng Nam', aliases: ['hoi an', 'hội an'] },
  { name: 'Quảng Ngãi', aliases: [] },
  { name: 'Quảng Ninh', aliases: ['ha long', 'hạ long'] },
  { name: 'Quảng Trị', aliases: [] },
  { name: 'Sóc Trăng', aliases: [] },
  { name: 'Sơn La', aliases: [] },
  { name: 'Tây Ninh', aliases: [] },
  { name: 'Thái Bình', aliases: [] },
  { name: 'Thái Nguyên', aliases: [] },
  { name: 'Thanh Hóa', aliases: [] },
  { name: 'Thừa Thiên Huế', aliases: ['hue', 'huế'] },
  { name: 'Tiền Giang', aliases: ['my tho'] },
  { name: 'Trà Vinh', aliases: [] },
  { name: 'Tuyên Quang', aliases: [] },
  { name: 'Vĩnh Long', aliases: [] },
  { name: 'Vĩnh Phúc', aliases: [] },
  { name: 'Yên Bái', aliases: [] },
];

export function normalizeVi(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function inferProvinceFromAddress(text?: string | null): string | null {
  if (!text?.trim()) return null;
  const n = normalizeVi(text);
  for (const p of VN_PROVINCES) {
    const names = [p.name, ...p.aliases];
    if (names.some((alias) => n.includes(normalizeVi(alias)))) {
      return p.name;
    }
  }
  return null;
}

export function goalLabels(ids: string[]): string[] {
  const labels: string[] = [];
  for (const id of ids) {
    const found = AUTOPILOT_GOALS.find((g) => g.id === id);
    if (found) labels.push(found.label);
  }
  return labels;
}

export function snapBudgetToPreset(amount: number): { amount: number; presetId: string } {
  const presets = [...AUTOPILOT_BUDGET_PRESETS];
  let best = presets[1] ?? presets[0];
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const p of presets) {
    const diff = Math.abs(p.amount - amount);
    if (diff < bestDiff) {
      best = p;
      bestDiff = diff;
    }
  }
  if (!best) {
    return { amount: Math.round(amount), presetId: 'custom' };
  }
  if (bestDiff / Math.max(amount, 1) <= 0.25) {
    return { amount: best.amount, presetId: best.id };
  }
  return { amount: Math.round(amount), presetId: 'custom' };
}
