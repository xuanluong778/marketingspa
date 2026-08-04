export type ValidateConnectionParams = {
  organizationId: string;
  accountRef: string;
  credentials: Record<string, string>;
};

export type ConnectionValidationResult = {
  valid: boolean;
  message?: string;
  displayName?: string;
  permissions?: string[];
  tokenExpiresAt?: Date | null;
};

export type NormalizedWebhookEvent = {
  rawEventKey: string;
};

export type EstimateCostParams = {
  to: string;
  templateId: string;
};

export interface MessagingProvider {
  send?(...args: unknown[]): Promise<unknown>;
  validateConnection(params: ValidateConnectionParams): Promise<ConnectionValidationResult>;
  verifyWebhookSignature?(rawBody: Buffer, signature: string, secret: string): boolean;
  normalizeWebhook(payload: unknown, accountRef: string): NormalizedWebhookEvent[];
  estimateCost?(params: EstimateCostParams): number;
}
