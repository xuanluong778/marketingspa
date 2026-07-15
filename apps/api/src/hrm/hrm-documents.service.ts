import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createWriteStream, existsSync, mkdirSync, writeFileSync, copyFileSync } from 'fs';
import { join, extname } from 'path';
import { randomUUID } from 'crypto';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateEmployeeDocumentDto,
  UploadEmployeeDocumentMetaDto,
} from './dto/document.dto';
import type { HrmActor } from './hrm-employees.service';
import { HrmEmployeesService } from './hrm-employees.service';

type UploadedFile = {
  originalname?: string;
  mimetype?: string;
  size?: number;
  buffer?: Buffer;
  path?: string;
  stream?: Readable;
};

@Injectable()
export class HrmDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly employees: HrmEmployeesService,
    private readonly config: ConfigService,
  ) {}

  private uploadsRoot() {
    return join(process.cwd(), 'uploads', 'hrm');
  }

  private publicFileUrl(organizationId: string, filename: string) {
    const port = this.config.get<number>('PORT', 4000);
    const base =
      this.config.get<string>('API_PUBLIC_URL') ?? `http://localhost:${port}`;
    return `${base.replace(/\/$/, '')}/uploads/hrm/${organizationId}/${filename}`;
  }

  async listByEmployee(organizationId: string, employeeId: string) {
    await this.employees.ensureEmployee(organizationId, employeeId);
    return this.prisma.employeeDocument.findMany({
      where: { organizationId, employeeId, isArchived: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(
    organizationId: string,
    employeeId: string,
    dto: CreateEmployeeDocumentDto,
    actor?: HrmActor,
  ) {
    const employee = await this.employees.ensureEmployee(organizationId, employeeId);

    const document = await this.prisma.employeeDocument.create({
      data: {
        organizationId,
        employeeId,
        branchId: employee.branchId,
        title: dto.title,
        type: dto.type,
        fileUrl: dto.fileUrl,
        fileKey: dto.fileKey,
        mimeType: dto.mimeType,
        sizeBytes: dto.sizeBytes,
        issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : undefined,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        uploadedById: actor?.userId,
      },
    });

    await this.audit.log({
      organizationId,
      userId: actor?.userId,
      action: 'hrm.document.create',
      entityType: 'EmployeeDocument',
      entityId: document.id,
      metadata: {
        after: {
          employeeId,
          title: document.title,
          type: document.type,
          fileUrl: document.fileUrl,
        },
      },
      ipAddress: actor?.ipAddress,
    });

    return document;
  }

  async upload(
    organizationId: string,
    employeeId: string,
    file: UploadedFile | undefined,
    meta: UploadEmployeeDocumentMetaDto,
    actor?: HrmActor,
  ) {
    if (!file?.buffer && !file?.path && !file?.stream) {
      throw new BadRequestException('Thiếu file upload');
    }

    const employee = await this.employees.ensureEmployee(organizationId, employeeId);
    const dir = join(this.uploadsRoot(), organizationId);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const safeExt = extname(file.originalname || '').slice(0, 20);
    const filename = `${randomUUID()}${safeExt}`;
    const absPath = join(dir, filename);
    const fileKey = `hrm/${organizationId}/${filename}`;

    if (file.buffer) {
      writeFileSync(absPath, file.buffer);
    } else if (file.stream) {
      await pipeline(file.stream, createWriteStream(absPath));
    } else if (file.path) {
      copyFileSync(file.path, absPath);
    }

    const fileUrl = this.publicFileUrl(organizationId, filename);

    const document = await this.prisma.employeeDocument.create({
      data: {
        organizationId,
        employeeId,
        branchId: employee.branchId,
        title: meta.title,
        type: meta.type,
        fileUrl,
        fileKey,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        issuedAt: meta.issuedAt ? new Date(meta.issuedAt) : undefined,
        expiresAt: meta.expiresAt ? new Date(meta.expiresAt) : undefined,
        uploadedById: actor?.userId,
      },
    });

    await this.audit.log({
      organizationId,
      userId: actor?.userId,
      action: 'hrm.document.upload',
      entityType: 'EmployeeDocument',
      entityId: document.id,
      metadata: {
        after: {
          employeeId,
          title: document.title,
          type: document.type,
          fileUrl: document.fileUrl,
          fileKey: document.fileKey,
        },
      },
      ipAddress: actor?.ipAddress,
    });

    return document;
  }

  async archive(organizationId: string, id: string, actor?: HrmActor) {
    const existing = await this.prisma.employeeDocument.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw new NotFoundException('Tài liệu không tồn tại');
    if (existing.isArchived) {
      return existing;
    }

    const document = await this.prisma.employeeDocument.update({
      where: { id },
      data: { isArchived: true },
    });

    await this.audit.log({
      organizationId,
      userId: actor?.userId,
      action: 'hrm.document.archive',
      entityType: 'EmployeeDocument',
      entityId: id,
      metadata: {
        before: { isArchived: false },
        after: { isArchived: true },
      },
      ipAddress: actor?.ipAddress,
    });

    return document;
  }
}
