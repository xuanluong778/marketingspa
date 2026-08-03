export type PolicyImportResult = {
  sourceType: string;
  warnings: string[];
  insufficientData: boolean;
  message?: string;
  headline?: string;
  primaryText?: string;
  description?: string;
  url?: string;
  editable?: boolean;
  landing?: Record<string, unknown>;
};

export function analyzeLandingSignals(..._args: unknown[]): Record<string, unknown> {
  return {};
}

export async function importPolicyUrl(..._args: unknown[]): Promise<PolicyImportResult> {
  return {
    sourceType: 'website',
    warnings: ['Facebook policy import unavailable — source not restored'],
    insufficientData: true,
    message: 'INSUFFICIENT_DATA: facebook-policy import not restored',
  };
}
