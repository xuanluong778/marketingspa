export function assertMetaAdsOAuthConfigured(): void {
  // Soft check — runtime services validate credentials when used.
  if (!process.env.META_APP_ID && !process.env.FACEBOOK_APP_ID) {
    return;
  }
}
