import { AdAutomationAction, AdAutomationRuleType } from '@marketingspa/database';
import type { CampaignMetrics } from './ads-efficiency.util';

export interface RuleEvaluation {
  ruleId: string;
  ruleType: AdAutomationRuleType;
  action: AdAutomationAction;
  reason: string;
  shouldPause: boolean;
  shouldAlert: boolean;
  /** % thay đổi ngân sách đề xuất (dương = tăng, âm = giảm). */
  budgetChangePercent?: number;
}

export interface AutomationRuleInput {
  id: string;
  ruleType: AdAutomationRuleType;
  threshold: number | null;
  spendThreshold: number | null;
  enabled: boolean;
}

export function evaluateRules(
  rules: AutomationRuleInput[],
  metrics: CampaignMetrics,
  campaignStatus: string,
  opts?: { minSpendForAction?: number | null },
): RuleEvaluation[] {
  const results: RuleEvaluation[] = [];
  const minSpend = opts?.minSpendForAction ?? 0;

  for (const rule of rules) {
    if (!rule.enabled) continue;

    const threshold = rule.threshold ?? 0;
    const spendThreshold = rule.spendThreshold ?? 0;
    const resultsCount = metrics.conversions + metrics.leads;

    if (minSpend > 0 && metrics.spend < minSpend) {
      continue;
    }

    switch (rule.ruleType) {
      case 'PAUSE_SPEND_NO_CONVERSION':
        if (
          metrics.spend >= spendThreshold &&
          spendThreshold > 0 &&
          resultsCount === 0 &&
          campaignStatus === 'ACTIVE'
        ) {
          results.push({
            ruleId: rule.id,
            ruleType: rule.ruleType,
            action: AdAutomationAction.PAUSE,
            reason: `Chi tiêu ${metrics.spend} ≥ ${spendThreshold} nhưng không có lead/chuyển đổi`,
            shouldPause: true,
            shouldAlert: true,
          });
        }
        break;

      case 'PAUSE_CPA_THRESHOLD':
        if (
          metrics.cpa > threshold &&
          threshold > 0 &&
          resultsCount > 0 &&
          campaignStatus === 'ACTIVE'
        ) {
          results.push({
            ruleId: rule.id,
            ruleType: rule.ruleType,
            action: AdAutomationAction.PAUSE,
            reason: `CPA/CPL ${metrics.cpa} vượt ngưỡng ${threshold}`,
            shouldPause: true,
            shouldAlert: true,
          });
        }
        break;

      case 'PAUSE_ROAS_THRESHOLD':
        if (
          metrics.roas != null &&
          metrics.roas < threshold &&
          threshold > 0 &&
          campaignStatus === 'ACTIVE'
        ) {
          results.push({
            ruleId: rule.id,
            ruleType: rule.ruleType,
            action: AdAutomationAction.PAUSE,
            reason: `ROAS ${metrics.roas} thấp hơn ngưỡng ${threshold}`,
            shouldPause: true,
            shouldAlert: true,
          });
        }
        break;

      case 'ALERT_CTR_LOW':
        if (metrics.ctr < threshold && threshold > 0) {
          results.push({
            ruleId: rule.id,
            ruleType: rule.ruleType,
            action: AdAutomationAction.ALERT,
            reason: `CTR ${metrics.ctr}% thấp hơn ngưỡng ${threshold}%`,
            shouldPause: false,
            shouldAlert: true,
          });
        }
        break;

      case 'ALERT_CPM_HIGH':
        if (metrics.cpm > threshold && threshold > 0) {
          results.push({
            ruleId: rule.id,
            ruleType: rule.ruleType,
            action: AdAutomationAction.ALERT,
            reason: `CPM ${metrics.cpm} cao hơn ngưỡng ${threshold}`,
            shouldPause: false,
            shouldAlert: true,
          });
        }
        break;

      case 'ALERT_CPC_HIGH':
        if (metrics.cpc > threshold && threshold > 0) {
          results.push({
            ruleId: rule.id,
            ruleType: rule.ruleType,
            action: AdAutomationAction.ALERT,
            reason: `CPC ${metrics.cpc} cao hơn ngưỡng ${threshold}`,
            shouldPause: false,
            shouldAlert: true,
          });
        }
        break;

      case 'ALERT_CPA_INCREASE':
        if (metrics.cpa > threshold && threshold > 0) {
          results.push({
            ruleId: rule.id,
            ruleType: rule.ruleType,
            action: AdAutomationAction.ALERT,
            reason: `CPA tăng — hiện ${metrics.cpa}, ngưỡng ${threshold}`,
            shouldPause: false,
            shouldAlert: true,
          });
        }
        break;

      case 'ALERT_ROAS_DROP':
        if (metrics.roas != null && metrics.roas < threshold && threshold > 0) {
          results.push({
            ruleId: rule.id,
            ruleType: rule.ruleType,
            action: AdAutomationAction.ALERT,
            reason: `ROAS giảm — hiện ${metrics.roas}, ngưỡng ${threshold}`,
            shouldPause: false,
            shouldAlert: true,
          });
        }
        break;

      case 'ADJUST_BUDGET_UP_ROAS':
        if (
          metrics.roas != null &&
          metrics.roas >= threshold &&
          threshold > 0 &&
          campaignStatus === 'ACTIVE'
        ) {
          results.push({
            ruleId: rule.id,
            ruleType: rule.ruleType,
            action: AdAutomationAction.RECOMMEND,
            reason: `ROAS ${metrics.roas} ≥ ${threshold} — đề xuất tăng ngân sách`,
            shouldPause: false,
            shouldAlert: true,
            budgetChangePercent: 10,
          });
        }
        break;

      case 'ADJUST_BUDGET_DOWN_CPA':
        if (
          metrics.cpa > threshold &&
          threshold > 0 &&
          resultsCount > 0 &&
          campaignStatus === 'ACTIVE'
        ) {
          results.push({
            ruleId: rule.id,
            ruleType: rule.ruleType,
            action: AdAutomationAction.RECOMMEND,
            reason: `CPA ${metrics.cpa} > ${threshold} — đề xuất giảm ngân sách`,
            shouldPause: false,
            shouldAlert: true,
            budgetChangePercent: -10,
          });
        }
        break;
    }
  }

  return results;
}

/** Giới hạn % thay đổi ngân sách mỗi ngày theo settings. */
export function clampBudgetChangePercent(
  requestedPercent: number,
  maxBudgetChangePercent: number,
): number {
  const max = Math.max(0, Math.min(100, maxBudgetChangePercent));
  if (requestedPercent > max) return max;
  if (requestedPercent < -max) return -max;
  return requestedPercent;
}

export type McpMode = 'OBSERVE' | 'SUGGEST' | 'AUTO';

export function normalizeMcpMode(raw: string | null | undefined): McpMode {
  const v = String(raw ?? 'SUGGEST').toUpperCase();
  if (v === 'OBSERVE' || v === 'AUTO' || v === 'SUGGEST') return v;
  return 'SUGGEST';
}
