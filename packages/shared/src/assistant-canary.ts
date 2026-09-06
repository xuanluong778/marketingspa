/**
 * AI Assistant canary / org rollout controls (pure — no Nest).
 *
 * ASSISTANT_CANARY=true  → only orgs in ASSISTANT_CANARY_ORG_IDS
 * ASSISTANT_CANARY=false (or unset) → open to all orgs with RBAC (full production mode)
 * ASSISTANT_ENABLED=false → hard off for everyone (emergency)
 *
 * OWNER/SUPER_ADMIN never bypass canary or tenant — only permission *string* checks elsewhere.
 */

export function parseOrgIdList(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return String(raw)
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s),
    );
}

export function isTruthyEnv(raw: string | undefined | null): boolean {
  if (raw == null) return false;
  const v = String(raw).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export type AssistantCanaryConfig = {
  /** Master kill switch — false disables for all orgs */
  masterEnabled: boolean;
  /** Canary/org allowlist mode */
  canaryMode: boolean;
  allowlistOrgIds: readonly string[];
};

export function loadAssistantCanaryConfig(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): AssistantCanaryConfig {
  // default master ON so existing deployments keep working until canary is set
  const masterRaw = env.ASSISTANT_ENABLED;
  const masterEnabled = masterRaw == null || masterRaw === '' ? true : isTruthyEnv(masterRaw);

  return {
    masterEnabled,
    canaryMode: isTruthyEnv(env.ASSISTANT_CANARY),
    allowlistOrgIds: parseOrgIdList(env.ASSISTANT_CANARY_ORG_IDS),
  };
}

/**
 * Whether this organization may use Trợ lý Bạch Cốt Tinh (API + FAB).
 * Does NOT grant RBAC permissions — still need assistant.use.
 */
export function isAssistantOrgAllowed(
  organizationId: string,
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): boolean {
  const cfg = loadAssistantCanaryConfig(env);
  if (!cfg.masterEnabled) return false;
  if (!organizationId) return false;
  if (!cfg.canaryMode) return true;
  return cfg.allowlistOrgIds.includes(organizationId);
}

export function assistantCanaryDenyMessage(cfg?: AssistantCanaryConfig): string {
  const c = cfg ?? loadAssistantCanaryConfig();
  if (!c.masterEnabled) {
    return 'Trợ lý Bạch Cốt Tinh đang tạm tắt trên hệ thống.';
  }
  if (c.canaryMode) {
    return 'Trợ lý Bạch Cốt Tinh đang canary — tổ chức của bạn chưa được bật. Liên hệ quản trị.';
  }
  return 'Trợ lý Bạch Cốt Tinh không khả dụng.';
}
