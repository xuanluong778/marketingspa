import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  getCurrent(organizationId: string) {
    return this.prisma.organization.findFirst({
      where: { id: organizationId },
      include: {
        branches: { where: { isActive: true }, orderBy: { name: 'asc' } },
        _count: {
          select: {
            customers: true,
            leads: true,
            employees: true,
            appointments: true,
          },
        },
      },
    });
  }

  async update(organizationId: string, dto: UpdateOrganizationDto) {
    await this.ensureOrg(organizationId);
    return this.prisma.organization.update({
      where: { id: organizationId },
      data: dto,
    });
  }

  listBranches(organizationId: string) {
    return this.prisma.branch.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });
  }

  async createBranch(organizationId: string, dto: CreateBranchDto) {
    return this.prisma.branch.create({
      data: { ...dto, organizationId },
    });
  }

  async updateBranch(organizationId: string, branchId: string, dto: UpdateBranchDto) {
    await this.ensureBranch(organizationId, branchId);
    return this.prisma.branch.update({ where: { id: branchId }, data: dto });
  }

  async deleteBranch(organizationId: string, branchId: string) {
    await this.ensureBranch(organizationId, branchId);
    return this.prisma.branch.update({
      where: { id: branchId },
      data: { isActive: false },
    });
  }

  private async ensureOrg(organizationId: string) {
    const org = await this.prisma.organization.findFirst({ where: { id: organizationId } });
    if (!org) throw new NotFoundException('Organization không tồn tại');
    return org;
  }

  private async ensureBranch(organizationId: string, branchId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, organizationId },
    });
    if (!branch) throw new NotFoundException('Chi nhánh không tồn tại');
    return branch;
  }
}
