/** Redact Meta OAuth secrets before showing in UI / console. */
export function redactClientSecrets(text: string): string {
  return String(text ?? '')
    .replace(/access_token\s*=\s*[^&\s#]+/gi, 'access_token=[REDACTED]')
    .replace(/(fb_exchange_token|client_secret|app_secret)=[^&\s#]+/gi, '$1=[REDACTED]')
    .replace(/([?&#])(code|state)=([^&#]*)/gi, '$1$2=[REDACTED]')
    .replace(/\b(?:EAAG|EAAD|EAA|EBA|EAAE)[A-Za-z0-9_-]{10,}\b/g, '[meta_token]')
    .slice(0, 400);
}
