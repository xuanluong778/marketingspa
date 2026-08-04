import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const orgs = await prisma.organization.findMany();
  console.log(`Found ${orgs.length} organizations. Seeding test data for each...`);

  for (const org of orgs) {
    console.log(`Seeding for organization: ${org.name} (${org.id})`);

    // 1. Ensure branch
    let branch = await prisma.branch.findFirst({ where: { organizationId: org.id } });
    if (!branch) {
      branch = await prisma.branch.create({
        data: {
          organizationId: org.id,
          name: 'Chi nhánh Quận 1',
        }
      });
      console.log(`  Created mock branch for ${org.name}`);
    }

    // 2. Ensure connection
    let conn = await prisma.messagingChannelConnection.findFirst({
      where: { organizationId: org.id, channel: 'MESSENGER' }
    });
    if (!conn) {
      conn = await prisma.messagingChannelConnection.create({
        data: {
          organizationId: org.id,
          channel: 'MESSENGER',
          providerKind: 'MESSENGER',
          accountRef: `mock-page-${org.id.slice(0, 8)}`,
          displayName: 'Fanpage Test Chăm Sóc Khách Hàng',
          status: 'ACTIVE',
          permissions: ['MESSAGES'],
        }
      });
      console.log(`  Created mock Messenger connection for ${org.name}`);
    }

    // 3. Ensure templates
    const template1 = await prisma.messageTemplate.findFirst({
      where: { organizationId: org.id, name: '[Mock] Nhắc lịch hẹn tự động' }
    });
    if (!template1) {
      await prisma.messageTemplate.create({
        data: {
          organizationId: org.id,
          name: '[Mock] Nhắc lịch hẹn tự động',
          channel: 'MESSENGER',
          subject: 'Xác nhận lịch hẹn tại Spa',
          body: 'Xin chào {{customer_name}}, hệ thống Spa xác nhận lịch hẹn của bạn vào lúc {{appointment_time}} tại {{branch_name}}. Dịch vụ thực hiện: {{service_name}}. Hân hạnh phục vụ!',
          variables: ['customer_name', 'appointment_time', 'branch_name', 'service_name'],
          isActive: true,
        }
      });
      console.log(`  Created mock template 1 for ${org.name}`);
    }

    const template2 = await prisma.messageTemplate.findFirst({
      where: { organizationId: org.id, name: '[Mock] Tri ân khách hàng' }
    });
    if (!template2) {
      await prisma.messageTemplate.create({
        data: {
          organizationId: org.id,
          name: '[Mock] Tri ân khách hàng',
          channel: 'MESSENGER',
          subject: 'Tri ân khách hàng thân thiết',
          body: 'Chào {{customer_name}} thân mến! Cảm ơn bạn đã đồng hành cùng chúng tôi tại {{branch_name}}. Chúng tôi xin gửi tặng bạn ưu đãi chăm sóc da đặc biệt.',
          variables: ['customer_name', 'branch_name'],
          isActive: true,
        }
      });
      console.log(`  Created mock template 2 for ${org.name}`);
    }

    // 4. Ensure service
    let service = await prisma.service.findFirst({ where: { organizationId: org.id } });
    if (!service) {
      service = await prisma.service.create({
        data: {
          organizationId: org.id,
          name: 'Liệu trình Chăm sóc da chuyên sâu',
          price: 500000,
        }
      });
      console.log(`  Created mock service for ${org.name}`);
    }

    // 5. Create mock Customers and Leads
    let customerA = await prisma.customer.findFirst({ where: { organizationId: org.id, name: 'Nguyễn Văn A' } });
    if (!customerA) {
      customerA = await prisma.customer.create({
        data: {
          organizationId: org.id,
          name: 'Nguyễn Văn A',
          phone: '0901234567',
          branchId: branch.id,
        }
      });
    }

    let customerB = await prisma.customer.findFirst({ where: { organizationId: org.id, name: 'Trần Thị B' } });
    if (!customerB) {
      customerB = await prisma.customer.create({
        data: {
          organizationId: org.id,
          name: 'Trần Thị B',
          phone: '0987654321',
          branchId: branch.id,
        }
      });
    }

    let leadC = await prisma.lead.findFirst({ where: { organizationId: org.id, name: 'Lê Văn C' } });
    if (!leadC) {
      leadC = await prisma.lead.create({
        data: {
          organizationId: org.id,
          name: 'Lê Văn C',
          phone: '0912345678',
        }
      });
    }

    // 6. Create messaging contact identities (connected to the mock Fanpage)
    const scopeKey = `messenger:${conn.accountRef}`;
    
    const identityA = await prisma.messagingContactIdentity.findFirst({
      where: { organizationId: org.id, externalUserId: `psid-a-${org.id.slice(0, 8)}` }
    });
    if (!identityA) {
      await prisma.messagingContactIdentity.create({
        data: {
          organizationId: org.id,
          channel: 'MESSENGER',
          integrationScopeKey: scopeKey,
          externalUserId: `psid-a-${org.id.slice(0, 8)}`,
          displayName: 'Nguyễn Văn A',
          customerId: customerA.id,
          lastInboundAt: new Date(), // within 24h window
        }
      });
    }

    const identityB = await prisma.messagingContactIdentity.findFirst({
      where: { organizationId: org.id, externalUserId: `psid-b-${org.id.slice(0, 8)}` }
    });
    if (!identityB) {
      await prisma.messagingContactIdentity.create({
        data: {
          organizationId: org.id,
          channel: 'MESSENGER',
          integrationScopeKey: scopeKey,
          externalUserId: `psid-b-${org.id.slice(0, 8)}`,
          displayName: 'Trần Thị B',
          customerId: customerB.id,
          lastInboundAt: new Date(), // within 24h window
        }
      });
    }

    const identityC = await prisma.messagingContactIdentity.findFirst({
      where: { organizationId: org.id, externalUserId: `psid-c-${org.id.slice(0, 8)}` }
    });
    if (!identityC) {
      await prisma.messagingContactIdentity.create({
        data: {
          organizationId: org.id,
          channel: 'MESSENGER',
          integrationScopeKey: scopeKey,
          externalUserId: `psid-c-${org.id.slice(0, 8)}`,
          displayName: 'Lê Văn C',
          leadId: leadC.id,
          lastInboundAt: new Date(), // within 24h window
        }
      });
    }

    // 7. Ensure Appointments to test variables resolution
    const appointmentA = await prisma.appointment.findFirst({
      where: { organizationId: org.id, customerId: customerA.id }
    });
    if (!appointmentA) {
      await prisma.appointment.create({
        data: {
          organizationId: org.id,
          branchId: branch.id,
          customerId: customerA.id,
          serviceId: service.id,
          scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // tomorrow
          status: 'SCHEDULED',
        }
      });
    }

    const appointmentB = await prisma.appointment.findFirst({
      where: { organizationId: org.id, customerId: customerB.id }
    });
    if (!appointmentB) {
      await prisma.appointment.create({
        data: {
          organizationId: org.id,
          branchId: branch.id,
          customerId: customerB.id,
          serviceId: service.id,
          scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // tomorrow
          status: 'SCHEDULED',
        }
      });
    }

    console.log(`  Completed seeding for ${org.name}`);
  }

  console.log('Seeding completed successfully!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
