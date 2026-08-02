import { ConflictException, Injectable } from '@nestjs/common';
import { AppointmentStatus } from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';

const BLOCKING: AppointmentStatus[] = [
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.ARRIVED,
];

@Injectable()
export class AppointmentConflictService {
  constructor(private readonly prisma: PrismaService) {}

  async assertNoConflict(
    organizationId: string,
    input: {
      scheduledAt: Date;
      durationMinutes: number;
      employeeId?: string | null;
      roomId?: string | null;
      bedId?: string | null;
      equipmentId?: string | null;
      excludeAppointmentId?: string;
    },
  ) {
    const start = input.scheduledAt;
    const end = new Date(start.getTime() + input.durationMinutes * 60_000);

    const candidates = await this.prisma.appointment.findMany({
      where: {
        organizationId,
        status: { in: BLOCKING },
        ...(input.excludeAppointmentId ? { id: { not: input.excludeAppointmentId } } : {}),
        OR: [
          ...(input.employeeId ? [{ employeeId: input.employeeId }] : []),
          ...(input.roomId ? [{ roomId: input.roomId }] : []),
          ...(input.bedId ? [{ bedId: input.bedId }] : []),
          ...(input.equipmentId ? [{ equipmentId: input.equipmentId }] : []),
        ],
        scheduledAt: {
          gte: new Date(start.getTime() - 12 * 3600_000),
          lte: new Date(end.getTime() + 12 * 3600_000),
        },
      },
      select: {
        id: true,
        scheduledAt: true,
        durationMinutes: true,
        employeeId: true,
        roomId: true,
        bedId: true,
        equipmentId: true,
      },
    });

    if (!input.employeeId && !input.roomId && !input.bedId && !input.equipmentId) {
      return;
    }

    for (const c of candidates) {
      const cStart = c.scheduledAt.getTime();
      const cEnd = cStart + c.durationMinutes * 60_000;
      const overlaps = start.getTime() < cEnd && end.getTime() > cStart;
      if (!overlaps) continue;

      if (input.employeeId && c.employeeId === input.employeeId) {
        throw new ConflictException('Nhân viên đã có lịch trùng giờ');
      }
      if (input.roomId && c.roomId === input.roomId) {
        throw new ConflictException('Phòng đã được đặt trùng giờ');
      }
      if (input.bedId && c.bedId === input.bedId) {
        throw new ConflictException('Giường đã được đặt trùng giờ');
      }
      if (input.equipmentId && c.equipmentId === input.equipmentId) {
        throw new ConflictException('Thiết bị đang được dùng trùng giờ');
      }
    }
  }
}
