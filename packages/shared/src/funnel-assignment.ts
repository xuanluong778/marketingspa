/** Lead assignment matching helpers (Prompt 11). */

export const LEAD_ASSIGNMENT_MODES = [
  'BRANCH',
  'EMPLOYEE',
  'ROUND_ROBIN',
  'LEAST_LOADED',
  'BY_SCORE',
] as const;

export type LeadAssignmentModeCode = (typeof LEAD_ASSIGNMENT_MODES)[number];

export type AssignmentRuleMatchInput = {
  branchId?: string | null;
  leadSourceId?: string | null;
  adCampaignId?: string | null;
  score?: number | null;
};

export type AssignmentRuleLike = {
  id: string;
  branchId?: string | null;
  leadSourceId?: string | null;
  adCampaignId?: string | null;
  minScore?: number | null;
  maxScore?: number | null;
  priority?: number | null;
  isActive?: boolean;
};

/**
 * Specificity score: campaign > source > branch > score-band > org-wide.
 * Higher priority breaks ties.
 */
export function assignmentRuleSpecificity(rule: AssignmentRuleLike): number {
  let s = (rule.priority ?? 0) * 1000;
  if (rule.adCampaignId) s += 400;
  if (rule.leadSourceId) s += 200;
  if (rule.branchId) s += 100;
  if (rule.minScore != null || rule.maxScore != null) s += 50;
  return s;
}

export function assignmentRuleMatches(
  rule: AssignmentRuleLike,
  lead: AssignmentRuleMatchInput,
): boolean {
  if (rule.isActive === false) return false;
  if (rule.branchId && rule.branchId !== (lead.branchId ?? null)) return false;
  if (rule.leadSourceId && rule.leadSourceId !== (lead.leadSourceId ?? null)) return false;
  if (rule.adCampaignId && rule.adCampaignId !== (lead.adCampaignId ?? null)) return false;
  const score = lead.score ?? 0;
  if (rule.minScore != null && score < rule.minScore) return false;
  if (rule.maxScore != null && score > rule.maxScore) return false;
  return true;
}

export function pickBestAssignmentRule<T extends AssignmentRuleLike>(
  rules: T[],
  lead: AssignmentRuleMatchInput,
): T | null {
  const matched = rules.filter((r) => assignmentRuleMatches(r, lead));
  if (!matched.length) return null;
  matched.sort((a, b) => assignmentRuleSpecificity(b) - assignmentRuleSpecificity(a));
  return matched[0] ?? null;
}

export function openLeadStatuses(): string[] {
  return ['NEW', 'CONTACTED', 'QUALIFIED', 'BOOKED', 'CONFIRMED', 'VISITED'];
}
