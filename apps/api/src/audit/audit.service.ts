import { Injectable } from '@nestjs/common';
import { Prisma } from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditLogInput {
  organizationId: string;
  userId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  log(input: AuditLogInput) {
    return this.prisma.auditLog.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: input.metadata,
      },
    });
  }
}
