import { Injectable } from '@nestjs/common';
import { Prisma } from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import { redactForAudit } from '../common/utils/token-security.util';

export interface AuditLogInput {
  organizationId?: string | null;
  userId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string;
  requestId?: string;
}

type AuditDb = Pick<PrismaService, 'auditLog'> | Prisma.TransactionClient;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Pass `tx` when calling inside `$transaction` so audit commits/rolls back atomically. */
  log(input: AuditLogInput, db: AuditDb = this.prisma) {
    const safeMeta = input.metadata
      ? (redactForAudit(input.metadata) as Prisma.InputJsonValue)
      : undefined;
    return db.auditLog.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: safeMeta,
        ipAddress: input.ipAddress,
        requestId: input.requestId,
      },
    });
  }
}
