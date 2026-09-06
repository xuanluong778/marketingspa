import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CreditError,
  CreditLedger,
  CreditTransactionType,
  Prisma,
  type CreditBalanceSnapshot,
  type CreditMutationResult,
  type PaidFeatureContext,
  type RunPaidFeatureParams,
} from '@marketingspa/database';
import {
  creditFeatureLabel,
  signedCreditAmount,
  type CreditCommitParams,
  type CreditGrantParams,
  type CreditPurchaseParams,
  type CreditRefundParams,
  type CreditReleaseParams,
  type CreditReserveParams,
  type CreditUsageParams,
} from '@marketingspa/shared';
import { PrismaService } from '../prisma/prisma.service';

export class InsufficientCreditsError extends BadRequestException {
  constructor(required: number, available: number) {
    super({
      code: 'INSUFFICIENT_CREDITS',
      message: 'Không đủ AI Credit',
      required,
      available,
    });
  }
}

export class CreditReservationNotFoundError extends NotFoundException {
  constructor(referenceId: string) {
    super({
      code: 'CREDIT_RESERVATION_NOT_FOUND',
      message: `Không tìm thấy reservation cho referenceId=${referenceId}`,
      referenceId,
    });
  }
}

export function isInsufficientCredits(err: unknown): boolean {
  if (err instanceof InsufficientCreditsError) return true;
  if (err instanceof CreditError && err.code === 'INSUFFICIENT_CREDITS') return true;
  if (err instanceof BadRequestException) {
    const body = err.getResponse();
    return typeof body === 'object' && body !== null && (body as { code?: string }).code === 'INSUFFICIENT_CREDITS';
  }
  return false;
}

@Injectable()
export class CreditService {
  private readonly ledger: CreditLedger;

  constructor(private readonly prisma: PrismaService) {
    this.ledger = new CreditLedger(this.prisma);
  }

  getBalance(organizationId: string): Promise<CreditBalanceSnapshot> {
    return this.wrap(() => this.ledger.getBalance(organizationId));
  }

  checkAvailable(organizationId: string, amount: number): Promise<boolean> {
    return this.wrap(() => this.ledger.checkAvailable(organizationId, amount));
  }

  getFeatureCost(featureCode: string): Promise<number> {
    return this.wrap(() => this.ledger.getFeatureCost(featureCode));
  }

  resolveFeatureAmount(featureCode: string, overrideAmount?: number): Promise<number> {
    return this.wrap(() => this.ledger.resolveFeatureAmount(featureCode, overrideAmount));
  }

  grant(
    params: CreditGrantParams,
    tx?: Prisma.TransactionClient,
  ): Promise<CreditMutationResult> {
    return this.wrap(() => this.ledger.grant(params, tx));
  }

  purchase(
    params: CreditPurchaseParams,
    tx?: Prisma.TransactionClient,
  ): Promise<CreditMutationResult> {
    return this.wrap(() => this.ledger.purchase(params, tx));
  }

  refund(params: CreditRefundParams): Promise<CreditMutationResult> {
    return this.wrap(() => this.ledger.refund(params));
  }

  adjust(
    params: {
      organizationId: string;
      delta: number;
      idempotencyKey: string;
      referenceId?: string;
      reason?: string;
      metadata?: Record<string, unknown>;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<CreditMutationResult> {
    return this.wrap(() => this.ledger.adjust(params, tx));
  }

  usage(params: CreditUsageParams): Promise<CreditMutationResult> {
    return this.wrap(() => this.ledger.usage(params));
  }

  reserve(params: CreditReserveParams): Promise<CreditMutationResult> {
    return this.wrap(() => this.ledger.reserve(params));
  }

  commit(params: CreditCommitParams): Promise<CreditMutationResult> {
    return this.wrap(() => this.ledger.commit(params));
  }

  release(params: CreditReleaseParams): Promise<CreditMutationResult> {
    return this.wrap(() => this.ledger.release(params));
  }

  hasCommitted(organizationId: string, referenceId: string): Promise<boolean> {
    return this.wrap(() => this.ledger.hasCommitted(organizationId, referenceId));
  }

  ensureWallet(organizationId: string) {
    return this.wrap(() => this.ledger.ensureWallet(organizationId));
  }

  runPaidFeature<T>(params: RunPaidFeatureParams<T>): Promise<T> {
    return this.wrap(() => this.ledger.runPaidFeature(params));
  }

  async listPackages() {
    const rows = await this.prisma.creditPackage.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ sortOrder: 'asc' }, { priceVnd: 'asc' }],
    });
    return rows.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      credits: Number(p.credits),
      priceVnd: Number(p.priceVnd),
      status: p.status,
    }));
  }

  async listHistory(
    organizationId: string,
    query: { page?: number; pageSize?: number; includeInternal?: boolean } = {},
  ) {
    await this.ensureWallet(organizationId);
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const where: Prisma.CreditTransactionWhereInput = { organizationId };
    if (!query.includeInternal) {
      where.type = { notIn: [CreditTransactionType.RESERVE, CreditTransactionType.RELEASE] };
    }

    const [total, rows, pricing] = await Promise.all([
      this.prisma.creditTransaction.count({ where }),
      this.prisma.creditTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.creditFeaturePricing.findMany({
        select: { featureCode: true, name: true },
      }),
    ]);

    const names = new Map(pricing.map((p) => [p.featureCode, p.name]));
    return {
      items: rows.map((row) => this.mapTransaction(row, names)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  mapTransaction(
    row: {
      id: string;
      type: CreditTransactionType | string;
      amount: Prisma.Decimal | number;
      balanceAfter: Prisma.Decimal | number;
      reservedAfter: Prisma.Decimal | number;
      reason: string | null;
      referenceId: string | null;
      featureCode: string | null;
      metadata: Prisma.JsonValue;
      createdAt: Date;
    },
    featureNames?: Map<string, string>,
  ) {
    const metadata =
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    const type = String(row.type);
    const featureName =
      (row.featureCode && featureNames?.get(row.featureCode)) ||
      creditFeatureLabel(row.featureCode, type, row.reason);
    return {
      id: row.id,
      createdAt: row.createdAt,
      type,
      featureCode: row.featureCode,
      featureLabel: featureName,
      reason: row.reason,
      referenceId: row.referenceId,
      amount: signedCreditAmount(type, Number(row.amount), metadata),
      balanceAfter: Number(row.balanceAfter),
      reservedAfter: Number(row.reservedAfter),
    };
  }

  private async wrap<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      throw this.toHttp(err);
    }
  }

  private toHttp(err: unknown): never {
    if (err instanceof CreditError) {
      if (err.code === 'INSUFFICIENT_CREDITS') {
        throw new InsufficientCreditsError(
          Number(err.extra.required ?? 0),
          Number(err.extra.available ?? 0),
        );
      }
      if (err.code === 'CREDIT_RESERVATION_NOT_FOUND') {
        throw new CreditReservationNotFoundError(String(err.extra.referenceId ?? ''));
      }
      if (err.code === 'FEATURE_PRICING_NOT_FOUND') {
        throw new NotFoundException(err.message);
      }
      if (err.code === 'RESERVE_UNDERFLOW') {
        throw new ConflictException(err.message);
      }
      if (err.code === 'ALREADY_COMMITTED') {
        throw new ConflictException({ code: err.code, message: err.message });
      }
      throw new BadRequestException({ code: err.code, message: err.message });
    }
    throw err;
  }
}

export type { PaidFeatureContext };
