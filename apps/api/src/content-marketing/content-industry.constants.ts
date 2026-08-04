export const SPA_BEAUTY_INDUSTRY_ID = 'cind0000-0000-4000-8000-00000000000a';
export const SPA_BEAUTY_INDUSTRY_NAME = 'Spa / Làm đẹp';
export const SPA_BEAUTY_SLUG = 'spa-beauty';

/** Catalog product (active) — “Dịch vụ khác” is the FE/API otherOption, not a DB row. */
export const CONTENT_INDUSTRY_CATALOG = [
  {
    id: SPA_BEAUTY_INDUSTRY_ID,
    slug: SPA_BEAUTY_SLUG,
    name: SPA_BEAUTY_INDUSTRY_NAME,
    sortOrder: 10,
    isSystem: true,
  },
  {
    id: 'cind0000-0000-4000-8000-000000000011',
    slug: 'tham-my-vien',
    name: 'Thẩm mỹ viện',
    sortOrder: 20,
    isSystem: false,
  },
  {
    id: 'cind0000-0000-4000-8000-000000000012',
    slug: 'salon-toc-nail',
    name: 'Salon tóc / Nail',
    sortOrder: 30,
    isSystem: false,
  },
  {
    id: 'cind0000-0000-4000-8000-000000000013',
    slug: 'nha-khoa',
    name: 'Nha khoa / Phòng khám',
    sortOrder: 40,
    isSystem: false,
  },
  {
    id: 'cind0000-0000-4000-8000-000000000014',
    slug: 'nha-hang',
    name: 'Nhà hàng / Quán ăn',
    sortOrder: 50,
    isSystem: false,
  },
  {
    id: 'cind0000-0000-4000-8000-000000000015',
    slug: 'cafe-do-uong',
    name: 'Café / Đồ uống',
    sortOrder: 60,
    isSystem: false,
  },
  {
    id: 'cind0000-0000-4000-8000-000000000016',
    slug: 'thoi-trang-phu-kien',
    name: 'Thời trang / Phụ kiện',
    sortOrder: 70,
    isSystem: false,
  },
  {
    id: 'cind0000-0000-4000-8000-000000000017',
    slug: 'my-pham-cham-soc',
    name: 'Mỹ phẩm / Chăm sóc cá nhân',
    sortOrder: 80,
    isSystem: false,
  },
  {
    id: 'cind0000-0000-4000-8000-000000000006',
    slug: 'bat-dong-san',
    name: 'Bất động sản',
    sortOrder: 90,
    isSystem: false,
  },
  {
    id: 'cind0000-0000-4000-8000-00000000000b',
    slug: 'giao-duc',
    name: 'Giáo dục / Đào tạo',
    sortOrder: 100,
    isSystem: false,
  },
  {
    id: 'cind0000-0000-4000-8000-000000000018',
    slug: 'o-to-xe-may',
    name: 'Ô tô / Xe máy',
    sortOrder: 110,
    isSystem: false,
  },
  {
    id: 'cind0000-0000-4000-8000-000000000005',
    slug: 'cong-nghe',
    name: 'Điện máy / Công nghệ',
    sortOrder: 120,
    isSystem: false,
  },
  {
    id: 'cind0000-0000-4000-8000-000000000019',
    slug: 'sua-chua-ky-thuat',
    name: 'Sửa chữa / Dịch vụ kỹ thuật',
    sortOrder: 130,
    isSystem: false,
  },
  {
    id: 'cind0000-0000-4000-8000-000000000008',
    slug: 'du-lich',
    name: 'Du lịch / Khách sạn',
    sortOrder: 140,
    isSystem: false,
  },
  {
    id: 'cind0000-0000-4000-8000-00000000000e',
    slug: 'noi-that',
    name: 'Nội thất / Xây dựng',
    sortOrder: 150,
    isSystem: false,
  },
] as const;

export const CONTENT_INDUSTRY_OTHER_OPTION = {
  id: null,
  slug: 'other',
  name: 'Dịch vụ khác',
} as const;

export function normalizeIndustrySearch(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .trim();
}
