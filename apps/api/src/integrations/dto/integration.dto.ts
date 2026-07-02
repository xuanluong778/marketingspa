import { IsObject } from 'class-validator';

export class ConnectIntegrationDto {
  @IsObject()
  credentials!: Record<string, string>;
}

/** Per-provider credential field hints for UI */
export const INTEGRATION_CREDENTIAL_FIELDS: Record<
  string,
  { key: string; label: string; type?: string }[]
> = {
  META_ADS: [
    { key: 'appId', label: 'App ID' },
    { key: 'appSecret', label: 'App Secret', type: 'password' },
    { key: 'accessToken', label: 'Access Token', type: 'password' },
  ],
  GOOGLE_ADS: [
    { key: 'clientId', label: 'Client ID' },
    { key: 'clientSecret', label: 'Client Secret', type: 'password' },
    { key: 'developerToken', label: 'Developer Token', type: 'password' },
  ],
  ZALO_OA: [
    { key: 'oaId', label: 'OA ID' },
    { key: 'secretKey', label: 'Secret Key', type: 'password' },
  ],
  SMS: [
    { key: 'apiKey', label: 'API Key', type: 'password' },
    { key: 'brandName', label: 'Brand name' },
  ],
  EMAIL: [
    { key: 'smtpHost', label: 'SMTP Host' },
    { key: 'smtpUser', label: 'SMTP User' },
    { key: 'smtpPassword', label: 'SMTP Password', type: 'password' },
  ],
};
