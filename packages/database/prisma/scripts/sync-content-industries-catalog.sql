-- Sync Content Studio industry catalog to product list (no schema change).
-- Keep spa-beauty system id. Deactivate obsolete rows. Upsert 15 active industries.
-- "Dịch vụ khác" remains the client otherOption (not a catalog row).

UPDATE "content_industries"
SET "is_active" = false, "updated_at" = NOW()
WHERE "slug" NOT IN (
  'spa-beauty',
  'tham-my-vien',
  'salon-toc-nail',
  'nha-khoa',
  'nha-hang',
  'cafe-do-uong',
  'thoi-trang-phu-kien',
  'my-pham-cham-soc',
  'bat-dong-san',
  'giao-duc',
  'o-to-xe-may',
  'cong-nghe',
  'sua-chua-ky-thuat',
  'du-lich',
  'noi-that'
);

INSERT INTO "content_industries" ("id", "slug", "name", "sort_order", "is_active", "is_system", "created_at", "updated_at")
VALUES
  ('cind0000-0000-4000-8000-00000000000a', 'spa-beauty', 'Spa / Làm đẹp', 10, true, true, NOW(), NOW()),
  ('cind0000-0000-4000-8000-000000000011', 'tham-my-vien', 'Thẩm mỹ viện', 20, true, false, NOW(), NOW()),
  ('cind0000-0000-4000-8000-000000000012', 'salon-toc-nail', 'Salon tóc / Nail', 30, true, false, NOW(), NOW()),
  ('cind0000-0000-4000-8000-000000000013', 'nha-khoa', 'Nha khoa / Phòng khám', 40, true, false, NOW(), NOW()),
  ('cind0000-0000-4000-8000-000000000014', 'nha-hang', 'Nhà hàng / Quán ăn', 50, true, false, NOW(), NOW()),
  ('cind0000-0000-4000-8000-000000000015', 'cafe-do-uong', 'Café / Đồ uống', 60, true, false, NOW(), NOW()),
  ('cind0000-0000-4000-8000-000000000016', 'thoi-trang-phu-kien', 'Thời trang / Phụ kiện', 70, true, false, NOW(), NOW()),
  ('cind0000-0000-4000-8000-000000000017', 'my-pham-cham-soc', 'Mỹ phẩm / Chăm sóc cá nhân', 80, true, false, NOW(), NOW()),
  ('cind0000-0000-4000-8000-000000000006', 'bat-dong-san', 'Bất động sản', 90, true, false, NOW(), NOW()),
  ('cind0000-0000-4000-8000-00000000000b', 'giao-duc', 'Giáo dục / Đào tạo', 100, true, false, NOW(), NOW()),
  ('cind0000-0000-4000-8000-000000000018', 'o-to-xe-may', 'Ô tô / Xe máy', 110, true, false, NOW(), NOW()),
  ('cind0000-0000-4000-8000-000000000005', 'cong-nghe', 'Điện máy / Công nghệ', 120, true, false, NOW(), NOW()),
  ('cind0000-0000-4000-8000-000000000019', 'sua-chua-ky-thuat', 'Sửa chữa / Dịch vụ kỹ thuật', 130, true, false, NOW(), NOW()),
  ('cind0000-0000-4000-8000-000000000008', 'du-lich', 'Du lịch / Khách sạn', 140, true, false, NOW(), NOW()),
  ('cind0000-0000-4000-8000-00000000000e', 'noi-that', 'Nội thất / Xây dựng', 150, true, false, NOW(), NOW())
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "sort_order" = EXCLUDED."sort_order",
  "is_active" = true,
  "is_system" = EXCLUDED."is_system",
  "updated_at" = NOW();
