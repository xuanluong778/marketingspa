import { Injectable } from '@nestjs/common';
import { Prisma } from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HrmAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async findHrmLogs(organizationId: string) {
    const where: Prisma.AuditLogWhereInput = {
      organizationId,
      OR: [
        { entityType: { startsWith: 'Employee' } },
        {
          entityType: {
            in: [
              'EmploymentContract',
              'EmployeeDocument',
              'EmployeeAccountInvite',
              'WorkShiftPolicy',
              'ShiftAssignment',
              'AttendancePunch',
              'AttendanceAdjustment',
              'TimesheetPeriod',
              'LeaveRequest',
              'OvertimeRequest',
            ],
          },
        },
        { action: { startsWith: 'employee.' } },
        { action: { startsWith: 'hrm.' } },
      ],
    };

    return this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });
  }
}
