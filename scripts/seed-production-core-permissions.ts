/**
 * Production-minimal idempotent seed:
 * - global Permission rows (needed by Auto Post PermissionsGuard / registration)
 * - NO Organization / User / Lead / mock data
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PERMISSION_DEFS = [
  { code: 'customer.read', name: 'Xem khách hàng', module: 'crm' },
  { code: 'customer.write', name: 'Sửa khách hàng', module: 'crm' },
  { code: 'lead.read', name: 'Xem lead', module: 'crm' },
  { code: 'lead.write', name: 'Sửa lead', module: 'crm' },
  { code: 'campaign.send', name: 'Gửi chiến dịch', module: 'marketing' },
  { code: 'order.read', name: 'Xem đơn hàng', module: 'finance' },
  { code: 'expense.write', name: 'Ghi chi phí', module: 'finance' },
  { code: 'report.view', name: 'Xem báo cáo', module: 'analytics' },
  { code: 'settings.manage', name: 'Quản lý cài đặt', module: 'admin' },
  { code: 'hrm.employee.read', name: 'Xem nhân viên', module: 'hrm' },
  { code: 'hrm.employee.write', name: 'Sửa nhân viên', module: 'hrm' },
  { code: 'hrm.contract.read', name: 'Xem hợp đồng', module: 'hrm' },
  { code: 'hrm.contract.write', name: 'Sửa hợp đồng', module: 'hrm' },
  { code: 'hrm.document.read', name: 'Xem tài liệu HR', module: 'hrm' },
  { code: 'hrm.document.write', name: 'Sửa tài liệu HR', module: 'hrm' },
  { code: 'hrm.account.manage', name: 'Quản lý tài khoản NV', module: 'hrm' },
  { code: 'hrm.audit.read', name: 'Xem audit HR', module: 'hrm' },
  { code: 'hrm.attendance.read', name: 'Xem chấm công', module: 'hrm' },
  { code: 'hrm.attendance.write', name: 'Chấm công / phân ca', module: 'hrm' },
  { code: 'hrm.attendance.lock', name: 'Khóa bảng công', module: 'hrm' },
  { code: 'hrm.leave.read', name: 'Xem phép / OT', module: 'hrm' },
  { code: 'hrm.leave.write', name: 'Tạo phép / OT', module: 'hrm' },
  { code: 'hrm.leave.approve', name: 'Duyệt phép / OT', module: 'hrm' },
  { code: 'automation.view', name: 'Xem automation', module: 'automation' },
  { code: 'automation.template.manage', name: 'Quản lý mẫu tin', module: 'automation' },
  { code: 'automation.campaign.create', name: 'Tạo/sửa chiến dịch automation', module: 'automation' },
  { code: 'automation.campaign.approve', name: 'Duyệt chiến dịch automation', module: 'automation' },
  { code: 'automation.campaign.send', name: 'Gửi/thử automation', module: 'automation' },
  { code: 'automation.campaign.pause', name: 'Tạm dừng/tiếp tục automation', module: 'automation' },
  { code: 'automation.integration.manage', name: 'Quản lý tích hợp kênh', module: 'automation' },
  { code: 'automation.logs.view', name: 'Xem nhật ký automation', module: 'automation' },
  { code: 'ads.read', name: 'Xem quảng cáo / insights', module: 'ads' },
  { code: 'ads.connect', name: 'Kết nối tài khoản Ads (OAuth)', module: 'ads' },
  { code: 'ads.sync', name: 'Đồng bộ dữ liệu Ads', module: 'ads' },
  { code: 'ads.analyze', name: 'Phân tích / AI draft Ads', module: 'ads' },
  { code: 'ads.manage', name: 'Quản lý chiến dịch Ads', module: 'ads' },
] as const;

async function main() {
  for (const p of PERMISSION_DEFS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { name: p.name, module: p.module },
      create: { code: p.code, name: p.name, module: p.module },
    });
  }
  const count = await prisma.permission.count();
  console.log(`OK: permissions upserted; total rows=${count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
