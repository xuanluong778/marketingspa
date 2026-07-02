import {
  PrismaClient,
  Gender,
  LeadPipelineStatus,
  AppointmentStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ExpenseCategory,
  AdPlatform,
  AdCampaignStatus,
  MessageChannel,
  MarketingCampaignStatus,
  AutomationTriggerType,
  AutomationLogStatus,
  SubscriptionStatus,
  CreditTransactionType,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const VIET_NAMES = [
  'Nguyễn Thị Mai',
  'Trần Văn Hùng',
  'Lê Thị Hoa',
  'Phạm Minh Tuấn',
  'Hoàng Thị Lan',
  'Võ Đức Anh',
  'Đặng Thị Thu',
  'Bùi Quốc Bảo',
  'Đỗ Thị Ngọc',
  'Ngô Văn Phúc',
  'Dương Thị Yến',
  'Lý Văn Thắng',
  'Hà Thị Linh',
  'Mai Văn Đạt',
  'Trịnh Thị Hương',
  'Cao Văn Kiên',
  'Phan Thị Oanh',
  'Vũ Minh Khang',
  'Tạ Thị Quỳnh',
  'Lương Văn Sơn',
];

const LEAD_STATUSES: LeadPipelineStatus[] = [
  LeadPipelineStatus.NEW,
  LeadPipelineStatus.CONTACTED,
  LeadPipelineStatus.BOOKED,
  LeadPipelineStatus.VISITED,
  LeadPipelineStatus.PURCHASED,
  LeadPipelineStatus.LOST,
];

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

async function main() {
  console.log('🌱 Seeding database (multi-tenant full schema)...');

  // --- Global permissions ---
  const permissionDefs = [
    { code: 'customer.read', name: 'Xem khách hàng', module: 'crm' },
    { code: 'customer.write', name: 'Sửa khách hàng', module: 'crm' },
    { code: 'lead.read', name: 'Xem lead', module: 'crm' },
    { code: 'lead.write', name: 'Sửa lead', module: 'crm' },
    { code: 'campaign.send', name: 'Gửi chiến dịch', module: 'marketing' },
    { code: 'order.read', name: 'Xem đơn hàng', module: 'finance' },
    { code: 'expense.write', name: 'Ghi chi phí', module: 'finance' },
    { code: 'report.view', name: 'Xem báo cáo', module: 'analytics' },
    { code: 'settings.manage', name: 'Quản lý cài đặt', module: 'admin' },
  ];

  const permissions = await Promise.all(
    permissionDefs.map((p) =>
      prisma.permission.upsert({
        where: { code: p.code },
        update: {},
        create: p,
      }),
    ),
  );

  // --- Subscription plans ---
  const starterPlan = await prisma.subscriptionPlan.upsert({
    where: { code: 'starter' },
    update: {},
    create: {
      code: 'starter',
      name: 'Starter',
      priceMonthly: new Decimal(990000),
      creditsIncluded: 500,
      features: ['crm', 'marketing_basic', '1_branch'],
    },
  });

  // --- Organization (1 spa) ---
  const org = await prisma.organization.upsert({
    where: { slug: 'demo-spa' },
    update: {},
    create: {
      name: 'Demo Spa Wellness',
      slug: 'demo-spa',
      phone: '02812345678',
      email: 'contact@demo-spa.com',
      address: '123 Nguyễn Huệ, Quận 1, TP.HCM',
    },
  });

  // --- Branch (1 chi nhánh) ---
  const branch = await prisma.branch.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'main' } },
    update: {},
    create: {
      organizationId: org.id,
      name: 'Chi nhánh Quận 1',
      code: 'main',
      address: '123 Nguyễn Huệ, Quận 1, TP.HCM',
      phone: '02812345678',
    },
  });

  // --- Roles & permissions ---
  const ownerRole = await prisma.role.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'OWNER' } },
    update: {},
    create: {
      organizationId: org.id,
      code: 'OWNER',
      name: 'Chủ spa',
      isSystem: true,
    },
  });

  const marketerRole = await prisma.role.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'MARKETER' } },
    update: {},
    create: {
      organizationId: org.id,
      code: 'MARKETER',
      name: 'Marketing',
      isSystem: true,
    },
  });

  const staffRole = await prisma.role.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'STAFF' } },
    update: {},
    create: {
      organizationId: org.id,
      code: 'STAFF',
      name: 'Nhân viên',
      isSystem: true,
    },
  });

  await prisma.rolePermission.createMany({
    data: permissions.map((p) => ({ roleId: ownerRole.id, permissionId: p.id })),
    skipDuplicates: true,
  });

  await prisma.rolePermission.createMany({
    data: permissions
      .filter((p) => p.module !== 'admin')
      .map((p) => ({ roleId: marketerRole.id, permissionId: p.id })),
    skipDuplicates: true,
  });

  // --- Employees (3 nhân viên) ---
  const employeeData = [
    { name: 'Nguyễn Thị Lan', position: 'Quản lý', email: 'lan@demo-spa.com' },
    { name: 'Trần Văn Minh', position: 'Lễ tân', email: 'minh@demo-spa.com' },
    { name: 'Lê Thị Hương', position: 'Kỹ thuật viên', email: 'huong@demo-spa.com' },
  ];

  const employees = [];
  for (const [i, emp] of employeeData.entries()) {
    const employee = await prisma.employee.upsert({
      where: { id: `00000000-0000-4000-8000-00000000010${i + 1}` },
      update: {},
      create: {
        id: `00000000-0000-4000-8000-00000000010${i + 1}`,
        organizationId: org.id,
        branchId: branch.id,
        name: emp.name,
        position: emp.position,
        email: emp.email,
        phone: `090100000${i + 1}`,
        hiredAt: daysAgo(365 - i * 30),
      },
    });
    employees.push(employee);
  }

  const passwordHash = await bcrypt.hash('password123', 10);

  // --- Users (3 tài khoản) ---
  await prisma.user.upsert({
    where: { email: 'admin@demo-spa.com' },
    update: { roleId: ownerRole.id, employeeId: employees[0]!.id },
    create: {
      email: 'admin@demo-spa.com',
      passwordHash,
      name: 'Admin Demo',
      organizationId: org.id,
      roleId: ownerRole.id,
      employeeId: employees[0]!.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'marketer@demo-spa.com' },
    update: {},
    create: {
      email: 'marketer@demo-spa.com',
      passwordHash,
      name: 'Marketing Demo',
      organizationId: org.id,
      roleId: marketerRole.id,
      employeeId: employees[1]!.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'staff@demo-spa.com' },
    update: {},
    create: {
      email: 'staff@demo-spa.com',
      passwordHash,
      name: 'Staff Demo',
      organizationId: org.id,
      roleId: staffRole.id,
      employeeId: employees[2]!.id,
    },
  });

  // --- Lead sources & funnel ---
  const sources = await Promise.all(
    ['Facebook', 'Google', 'Walk-in', 'Referral', 'Zalo'].map((name, i) =>
      prisma.leadSource.upsert({
        where: {
          organizationId_code: {
            organizationId: org.id,
            code: name.toLowerCase().replace('-', '_'),
          },
        },
        update: {},
        create: {
          organizationId: org.id,
          name,
          code: name.toLowerCase().replace('-', '_'),
        },
      }),
    ),
  );

  const funnelStages = await Promise.all(
    ['Mới', 'Đã liên hệ', 'Đặt lịch', 'Đến spa', 'Mua dịch vụ'].map((name, i) =>
      prisma.funnelStage.upsert({
        where: { organizationId_name: { organizationId: org.id, name } },
        update: {},
        create: {
          organizationId: org.id,
          name,
          position: i,
          isDefault: i === 0,
        },
      }),
    ),
  );

  // --- Services ---
  const serviceDefs = [
    { name: 'Massage body 60 phút', price: 450000, duration: 60 },
    { name: 'Massage body 90 phút', price: 650000, duration: 90 },
    { name: 'Chăm sóc da mặt', price: 350000, duration: 45 },
    { name: 'Gội đầu dưỡng sinh', price: 200000, duration: 30 },
    { name: 'Liệu trình detox', price: 1200000, duration: 120 },
  ];

  const services = [];
  for (const [i, s] of serviceDefs.entries()) {
    const service = await prisma.service.upsert({
      where: { id: `00000000-0000-4000-8000-00000000020${i + 1}` },
      update: {},
      create: {
        id: `00000000-0000-4000-8000-00000000020${i + 1}`,
        organizationId: org.id,
        name: s.name,
        price: new Decimal(s.price),
        durationMinutes: s.duration,
        category: 'Spa',
      },
    });
    services.push(service);
  }

  // --- 20 Customers ---
  const customers = [];
  for (let i = 0; i < 20; i++) {
    const customer = await prisma.customer.upsert({
      where: { id: `00000000-0000-4000-8000-0000000010${String(i + 1).padStart(2, '0')}` },
      update: {},
      create: {
        id: `00000000-0000-4000-8000-0000000010${String(i + 1).padStart(2, '0')}`,
        organizationId: org.id,
        branchId: branch.id,
        leadSourceId: randomItem(sources).id,
        name: VIET_NAMES[i]!,
        phone: `09${String(10000000 + i).slice(1)}`,
        email: `khach${i + 1}@example.com`,
        gender: i % 3 === 0 ? Gender.FEMALE : i % 3 === 1 ? Gender.MALE : Gender.UNKNOWN,
        birthday: new Date(1985 + (i % 15), i % 12, (i % 28) + 1),
        tags: i % 2 === 0 ? ['VIP', 'massage'] : ['mới'],
        note: i % 5 === 0 ? 'Khách thích massage nhẹ' : undefined,
        source: randomItem(sources).name,
      },
    });
    customers.push(customer);
  }

  // --- 30 Leads ---
  const leads = [];
  for (let i = 0; i < 30; i++) {
    const status = LEAD_STATUSES[i % LEAD_STATUSES.length]!;
    const lead = await prisma.lead.create({
      data: {
        organizationId: org.id,
        branchId: branch.id,
        leadSourceId: randomItem(sources).id,
        funnelStageId: funnelStages[Math.min(i % funnelStages.length, funnelStages.length - 1)]!.id,
        assignedToId: randomItem(employees).id,
        customerId: i < 15 ? customers[i]!.id : undefined,
        name: `Lead ${i + 1} - ${VIET_NAMES[i % VIET_NAMES.length]}`,
        phone: `08${String(20000000 + i).slice(1)}`,
        email: `lead${i + 1}@example.com`,
        pipelineStatus: status,
        estimatedValue: new Decimal(300000 + i * 50000),
        convertedAt: status === LeadPipelineStatus.PURCHASED ? daysAgo(i) : undefined,
        lostReason: status === LeadPipelineStatus.LOST ? 'Không phản hồi' : undefined,
      },
    });
    leads.push(lead);
  }

  // --- Appointments (8 lịch hẹn) ---
  const apptStatuses: AppointmentStatus[] = [
    AppointmentStatus.SCHEDULED,
    AppointmentStatus.CONFIRMED,
    AppointmentStatus.ARRIVED,
    AppointmentStatus.COMPLETED,
    AppointmentStatus.NO_SHOW,
    AppointmentStatus.CANCELLED,
    AppointmentStatus.SCHEDULED,
    AppointmentStatus.CONFIRMED,
  ];

  for (let i = 0; i < 8; i++) {
    await prisma.appointment.create({
      data: {
        organizationId: org.id,
        branchId: branch.id,
        customerId: customers[i % customers.length]!.id,
        leadId: i < leads.length ? leads[i]!.id : undefined,
        employeeId: employees[i % employees.length]!.id,
        serviceId: services[i % services.length]!.id,
        scheduledAt: i < 4 ? daysFromNow(i + 1) : daysAgo(i - 3),
        durationMinutes: 60,
        status: apptStatuses[i]!,
        note: i % 3 === 0 ? 'Khách yêu cầu phòng yên tĩnh' : undefined,
      },
    });
  }

  // --- Ad account, campaigns, daily stats, expenses ---
  const adAccount = await prisma.adAccount.upsert({
    where: { id: '00000000-0000-4000-8000-000000000301' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000301',
      organizationId: org.id,
      platform: AdPlatform.META,
      name: 'Facebook Ads - Demo Spa',
      externalId: 'act_demo_123',
      currency: 'VND',
    },
  });

  const adCampaign = await prisma.adCampaign.upsert({
    where: { id: '00000000-0000-4000-8000-000000000302' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000302',
      organizationId: org.id,
      adAccountId: adAccount.id,
      name: 'Chiến dịch Massage tháng 7',
      platform: AdPlatform.META,
      status: AdCampaignStatus.ACTIVE,
      budget: new Decimal(5000000),
      startDate: daysAgo(14),
      endDate: daysFromNow(14),
    },
  });

  for (let i = 0; i < 7; i++) {
    await prisma.adDailyStat.upsert({
      where: {
        adCampaignId_date: {
          adCampaignId: adCampaign.id,
          date: daysAgo(6 - i),
        },
      },
      update: {},
      create: {
        organizationId: org.id,
        adCampaignId: adCampaign.id,
        date: daysAgo(6 - i),
        impressions: 2000 + i * 300,
        clicks: 80 + i * 15,
        spend: new Decimal(350000 + i * 50000),
        leads: 3 + (i % 4),
        conversions: i % 3,
      },
    });
  }

  await prisma.expense.createMany({
    data: [
      {
        organizationId: org.id,
        branchId: branch.id,
        adCampaignId: adCampaign.id,
        category: ExpenseCategory.ADVERTISING,
        description: 'Quảng cáo Facebook tuần 1',
        amount: new Decimal(2500000),
        expenseDate: daysAgo(10),
      },
      {
        organizationId: org.id,
        adCampaignId: adCampaign.id,
        category: ExpenseCategory.ADVERTISING,
        description: 'Quảng cáo Facebook tuần 2',
        amount: new Decimal(1800000),
        expenseDate: daysAgo(3),
      },
      {
        organizationId: org.id,
        branchId: branch.id,
        category: ExpenseCategory.RENT,
        description: 'Tiền thuê mặt bằng tháng 7',
        amount: new Decimal(15000000),
        expenseDate: daysAgo(5),
      },
      {
        organizationId: org.id,
        category: ExpenseCategory.SUPPLIES,
        description: 'Mua tinh dầu massage',
        amount: new Decimal(850000),
        expenseDate: daysAgo(2),
      },
    ],
    skipDuplicates: true,
  });

  // --- Orders & payments (5 đơn) ---
  for (let i = 0; i < 5; i++) {
    const service = services[i % services.length]!;
    const qty = 1 + (i % 2);
    const subtotal = Number(service.price) * qty;
    const discount = i === 0 ? 50000 : 0;
    const total = subtotal - discount;

    const order = await prisma.order.create({
      data: {
        organizationId: org.id,
        branchId: branch.id,
        customerId: customers[i]!.id,
        orderNumber: `ORD-202507-${String(i + 1).padStart(4, '0')}`,
        status: OrderStatus.PAID,
        subtotal: new Decimal(subtotal),
        discount: new Decimal(discount),
        total: new Decimal(total),
        orderedAt: daysAgo(10 - i * 2),
        items: {
          create: {
            serviceId: service.id,
            name: service.name,
            quantity: qty,
            unitPrice: service.price,
            totalPrice: new Decimal(subtotal),
          },
        },
      },
    });

    await prisma.payment.create({
      data: {
        organizationId: org.id,
        orderId: order.id,
        amount: new Decimal(total),
        method: i % 2 === 0 ? PaymentMethod.MOMO : PaymentMethod.CASH,
        status: PaymentStatus.COMPLETED,
        paidAt: daysAgo(10 - i * 2),
        reference: `PAY-${i + 1}`,
      },
    });
  }

  // --- Message template & automation ---
  const template = await prisma.messageTemplate.upsert({
    where: { id: '00000000-0000-4000-8000-000000000401' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000401',
      organizationId: org.id,
      name: 'Nhắc lịch hẹn Zalo',
      channel: MessageChannel.ZALO,
      body: 'Xin chào {{customer_name}}, spa nhắc lịch hẹn {{appointment_time}} tại {{branch_name}}. Dịch vụ: {{service_name}}.',
      variables: ['customer_name', 'appointment_time', 'branch_name', 'service_name'],
    },
  });

  const automationFlow = await prisma.automationFlow.upsert({
    where: { id: '00000000-0000-4000-8000-000000000402' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000402',
      organizationId: org.id,
      messageTemplateId: template.id,
      name: 'Nhắc lịch trước 24h',
      triggerType: AutomationTriggerType.APPOINTMENT_24H_BEFORE,
      channel: MessageChannel.ZALO,
      delayMinutes: 0,
      triggerConfig: { hoursBefore: 24 },
    },
  });

  await prisma.automationLog.create({
    data: {
      organizationId: org.id,
      automationFlowId: automationFlow.id,
      customerId: customers[0]!.id,
      channel: MessageChannel.ZALO,
      renderedContent:
        'Xin chào Nguyễn Văn A, spa nhắc lịch hẹn 15/01/2025 10:00 tại Chi nhánh Quận 1.',
      status: AutomationLogStatus.SENT,
      executedAt: daysAgo(1),
      result: { channel: 'ZALO', simulated: true },
    },
  });

  // --- Marketing campaign (queue worker) ---
  const campaign = await prisma.campaign.upsert({
    where: { id: '00000000-0000-4000-8000-000000000501' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000501',
      organizationId: org.id,
      name: 'Khuyến mãi gói massage tháng 7',
      status: MarketingCampaignStatus.DRAFT,
      channel: MessageChannel.EMAIL,
    },
  });

  await prisma.campaignCustomer.createMany({
    data: customers.slice(0, 5).map((c) => ({
      campaignId: campaign.id,
      customerId: c.id,
    })),
    skipDuplicates: true,
  });

  // --- Subscription & credits ---
  await prisma.subscription.upsert({
    where: { id: '00000000-0000-4000-8000-000000000601' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000601',
      organizationId: org.id,
      planId: starterPlan.id,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: daysAgo(15),
      currentPeriodEnd: daysFromNow(15),
    },
  });

  const wallet = await prisma.creditWallet.upsert({
    where: { organizationId: org.id },
    update: {},
    create: {
      organizationId: org.id,
      balance: new Decimal(350),
    },
  });

  await prisma.creditTransaction.create({
    data: {
      organizationId: org.id,
      walletId: wallet.id,
      type: CreditTransactionType.CREDIT,
      amount: new Decimal(500),
      balanceAfter: new Decimal(500),
      reason: 'Gói Starter tháng đầu',
    },
  });

  await prisma.creditTransaction.create({
    data: {
      organizationId: org.id,
      walletId: wallet.id,
      type: CreditTransactionType.DEBIT,
      amount: new Decimal(150),
      balanceAfter: new Decimal(350),
      reason: 'Gửi SMS campaign',
    },
  });

  // --- AI report & audit log ---
  await prisma.aiReport.create({
    data: {
      organizationId: org.id,
      type: 'monthly_summary',
      title: 'Báo cáo marketing tháng 6',
      content: {
        revenue: 12500000,
        adSpend: 4300000,
        roi: 1.9,
        topChannel: 'Facebook',
      },
    },
  });

  const adminUser = await prisma.user.findUnique({ where: { email: 'admin@demo-spa.com' } });
  await prisma.auditLog.create({
    data: {
      organizationId: org.id,
      userId: adminUser?.id,
      action: 'SEED_COMPLETED',
      entityType: 'Organization',
      entityId: org.id,
      metadata: { customers: 20, leads: 30, orders: 5 },
      ipAddress: '127.0.0.1',
    },
  });

  console.log('✅ Seed completed');
  console.log('   Organization:', org.name);
  console.log('   Branch:', branch.name);
  console.log('   Customers: 20 | Leads: 30 | Orders: 5');
  console.log('   Login: admin@demo-spa.com / password123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
