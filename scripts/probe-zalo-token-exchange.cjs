/** Safe probe: token exchange rejects bad code (no secrets logged). */
const { exchangeZaloOaOAuthCode } = require('../packages/shared/dist');

(async () => {
  const appId = (process.env.ZALO_APP_ID || '').trim();
  const appSecret = (process.env.ZALO_APP_SECRET || '').trim();
  const redirectUri = (
    process.env.ZALO_REDIRECT_URI ||
    process.env.ZALO_OAUTH_REDIRECT_URI ||
    ''
  ).trim();

  const attempts = [
    { label: 'with_redirect_uri', redirectUri },
  ];

  for (const a of attempts) {
    try {
      await exchangeZaloOaOAuthCode({
        appId,
        appSecret,
        code: 'invalid_code_probe_' + Date.now(),
        redirectUri: a.redirectUri,
      });
      console.log(JSON.stringify({ attempt: a.label, result: 'UNEXPECTED_OK' }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(
        JSON.stringify({
          attempt: a.label,
          error: msg.slice(0, 200),
          looksLike14003: /14003|redirect/i.test(msg),
        }),
      );
    }
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
