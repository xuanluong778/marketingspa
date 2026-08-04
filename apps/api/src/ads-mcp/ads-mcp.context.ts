import { ForbiddenException } from '@nestjs/common';
import {
  ADS_MCP_TOOLS,
  adsMcpHasPermission,
  adsMcpTenantContextSchema,
  adsMcpToolPermissionMap,
  type AdsMcpTenantContext,
  type AdsMcpToolName,
} from '@marketingspa/shared';
import type { AuthUser } from '../common/interfaces/auth-user.interface';

/** Tạo tenant context từ AuthUser — không nhận orgId từ client body. */
export function tenantFromAuthUser(user: AuthUser): AdsMcpTenantContext {
  return adsMcpTenantContextSchema.parse({
    organizationId: user.organizationId,
    userId: user.id,
    role: user.role,
    permissions: user.permissions ?? [],
  });
}

export function assertMcpToolPermission(ctx: AdsMcpTenantContext, tool: AdsMcpToolName): void {
  const required = adsMcpToolPermissionMap[tool];
  if (!adsMcpHasPermission(ctx, required)) {
    throw new ForbiddenException(`Ads MCP tool ${tool} yêu cầu quyền ${required}`);
  }
}

export function listMcpToolDescriptors() {
  return Object.values(ADS_MCP_TOOLS).map((name) => ({
    name,
    permission: adsMcpToolPermissionMap[name],
    public: false,
    providerApis: false as const,
    dataSource: 'postgresql' as const,
  }));
}
