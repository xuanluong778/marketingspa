import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createWriteStream, existsSync, mkdirSync, writeFileSync, copyFileSync } from 'fs';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  assertUploadFile,
  randomStoredFilename,
} from '../common/uploads/upload-policy';
import { withSignedUploadUrl } from '../common/uploads/upload-signed-url';
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

  private signDoc<T extends { fileUrl?: string | null }>(doc: T): T {
    if (!doc?.fileUrl) return doc;
    return { ...doc, fileUrl: withSignedUploadUrl(doc.fileUrl) };
  }

  async listByEmployee(organizationId: string, employeeId: string) {
    await this.employees.ensureEmployee(organizationId, employeeId);
    const rows = await this.prisma.employeeDocument.findMany({
      where: { organizationId, employeeId, isArchived: false },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.signDoc(r));
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

    return this.signDoc(document);
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

    assertUploadFile('document', {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size ?? file.buffer?.length,
    });

    const employee = await this.employees.ensureEmployee(organizationId, employeeId);
    const dir = join(this.uploadsRoot(), organizationId);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const { filename } = randomStoredFilename(file.originalname || 'file.pdf');
    const absPath = join(dir, filename);
    const fileKey = `hrm/${organizationId}/${filename}`;

    if (file.buffer) {
      writeFileSync(absPath, file.buffer);
    } else if (file.stream) {
      await pipeline(file.stream, createWriteStream(absPath));
    } else if (file.path) {
      copyFileSync(file.path, absPath);
    }

    const storedPath = `/uploads/hrm/${organizationId}/${filename}`;

    const document = await this.prisma.employeeDocument.create({
      data: {
        organizationId,
        employeeId,
        branchId: employee.branchId,
        title: meta.title,
        type: meta.type,
        fileUrl: storedPath,
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

    return this.signDoc(document);
  }

  async archive(organizationId: string, id: string, actor?: HrmActor) {
    const existing = await this.prisma.employeeDocument.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw new NotFoundException('Tài liệu không tồn tại');
    if (existing.isArchived) {
      return this.signDoc(existing);
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

    return this.signDoc(document);
  }
}
