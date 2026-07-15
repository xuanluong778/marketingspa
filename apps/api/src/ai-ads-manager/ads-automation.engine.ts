import { AdAutomationAction, AdAutomationRuleType } from '@marketingspa/database';
import type { CampaignMetrics } from './ads-efficiency.util';

export interface RuleEvaluation {
  ruleId: string;
  ruleType: AdAutomationRuleType;
  action: AdAutomationAction;
  reason: string;
  shouldPause: boolean;
  shouldAlert: boolean;
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
): RuleEvaluation[] {
  const results: RuleEvaluation[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;

    const threshold = rule.threshold ?? 0;
    const spendThreshold = rule.spendThreshold ?? 0;
    const resultsCount = metrics.conversions + metrics.leads;

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
        if (metrics.cpa > threshold && threshold > 0 && resultsCount > 0 && campaignStatus === 'ACTIVE') {
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
    }
  }

  return results;
}
