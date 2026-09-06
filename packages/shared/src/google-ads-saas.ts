/**
 * Google Ads SaaS multi-tenant helpers.
 * Developer token is platform-shared; loginCustomerId / customerId / refreshToken
 * are always per-connection / per-account — never from a global env MCC.
 */

export type GoogleAdsAccessType = 'direct' | 'mcc';

export type GoogleAdsDiscoveredAccount = {
  customerId: string;
  name: string;
  currency: string;
  timezone: string;
  isManager: boolean;
  /** MCC to send as login-customer-id; null = direct access (do not force MCC). */
  loginCustomerId: string | null;
  accessType: GoogleAdsAccessType;
  parentId: string | null;
};

/** Normalize Google customer id (digits only). */
export function normalizeGoogleCustomerId(raw?: string | null): string {
  return String(raw ?? '').replace(/\D/g, '');
}

export function parseListAccessibleCustomerIds(resourceNames: string[] | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of resourceNames ?? []) {
    const id = normalizeGoogleCustomerId(String(r).replace(/^customers\//i, ''));
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/**
 * Direct-access accounts must NOT send a foreign MCC login-customer-id.
 * Only send login-customer-id when the OAuth user reaches the client via a manager.
 */
export function resolveGoogleLoginCustomerId(input: {
  customerId: string;
  isDirectAccess?: boolean;
  nearestManagerId?: string | null;
}): string | null {
  const cid = normalizeGoogleCustomerId(input.customerId);
  if (!cid) return null;
  if (input.isDirectAccess) return null;
  const manager = normalizeGoogleCustomerId(input.nearestManagerId);
  if (!manager || manager === cid) return null;
  return manager;
}

/** Headers for Google Ads REST. Omit login-customer-id for direct access. */
export function googleAdsLoginHeaders(
  customerId: string,
  loginCustomerId?: string | null,
): Record<string, string> {
  const cid = normalizeGoogleCustomerId(customerId);
  const login = normalizeGoogleCustomerId(loginCustomerId);
  if (!login || !cid || login === cid) return {};
  return { 'login-customer-id': login };
}

export function isGoogleAdsTwoFactorMessage(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('two_step_verification') ||
    m.includes('two-step verification') ||
    m.includes('2-step verification') ||
    m.includes('2fa')
  );
}

export function isGoogleAdsInvalidGrant(error?: string, description?: string): boolean {
  const blob = `${error ?? ''} ${description ?? ''}`.toLowerCase();
  return blob.includes('invalid_grant') || blob.includes('revoked') || blob.includes('disabled');
}

/**
 * Merge MCC children into accessible list. Direct-access ids keep loginCustomerId=null.
 * Children discovered only via a manager get loginCustomerId = that manager.
 */
export function mergeGoogleAdsHierarchy(input: {
  accessibleIds: string[];
  direct: Array<{
    customerId: string;
    name: string;
    currency: string;
    timezone: string;
    isManager: boolean;
  }>;
  childrenByManager: Record<
    string,
    Array<{
      customerId: string;
      name: string;
      currency?: string;
      timezone?: string;
      isManager?: boolean;
    }>
  >;
}): GoogleAdsDiscoveredAccount[] {
  const accessible = new Set(input.accessibleIds.map(normalizeGoogleCustomerId).filter(Boolean));
  const byId = new Map<string, GoogleAdsDiscoveredAccount>();

  for (const d of input.direct) {
    const id = normalizeGoogleCustomerId(d.customerId);
    if (!id) continue;
    byId.set(id, {
      customerId: id,
      name: d.name || id,
      currency: d.currency || 'USD',
      timezone: d.timezone || 'UTC',
      isManager: Boolean(d.isManager),
      loginCustomerId: null,
      accessType: 'direct',
      parentId: null,
    });
  }

  for (const [managerRaw, children] of Object.entries(input.childrenByManager)) {
    const managerId = normalizeGoogleCustomerId(managerRaw);
    if (!managerId) continue;
    for (const child of children) {
      const id = normalizeGoogleCustomerId(child.customerId);
      if (!id || id === managerId) continue;
      const existing = byId.get(id);
      if (existing?.accessType === 'direct') continue;
      byId.set(id, {
        customerId: id,
        name: child.name || existing?.name || id,
        currency: child.currency || existing?.currency || 'USD',
        timezone: child.timezone || existing?.timezone || 'UTC',
        isManager: Boolean(child.isManager),
        loginCustomerId: resolveGoogleLoginCustomerId({
          customerId: id,
          isDirectAccess: false,
          nearestManagerId: managerId,
        }),
        accessType: 'mcc',
        parentId: managerId,
      });
    }
  }

  const ordered: GoogleAdsDiscoveredAccount[] = [];
  const seen = new Set<string>();
  for (const id of input.accessibleIds.map(normalizeGoogleCustomerId)) {
    const row = byId.get(id);
    if (row && !seen.has(id)) {
      ordered.push(row);
      seen.add(id);
    }
  }
  for (const row of byId.values()) {
    if (!seen.has(row.customerId)) {
      ordered.push(row);
      seen.add(row.customerId);
    }
  }
  void accessible;
  return ordered;
}
