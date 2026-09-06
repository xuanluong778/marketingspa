/** Dump Zalo login Location continue URL (no secrets). */
const APP_ID = process.env.ZALO_APP_ID;
const GOOD =
  'https://marketingautoaz.com/api/v1/zalo-marketing/public/oauth/callback';
const url = `https://oauth.zaloapp.com/v4/oa/permission?app_id=${APP_ID}&redirect_uri=${encodeURIComponent(GOOD)}&state=shortstate`;

(async () => {
  const res = await fetch(url, {
    redirect: 'manual',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
    },
  });
  const loc = res.headers.get('location') || '';
  const u = new URL(loc);
  const keys = {};
  for (const [k, v] of u.searchParams) {
    if (/secret|token|password/i.test(k)) continue;
    keys[k] = v.length > 180 ? `${v.slice(0, 80)}…(${v.length})` : v;
  }
  console.log(
    JSON.stringify(
      {
        status: res.status,
        loginHost: u.host,
        loginPath: u.pathname,
        queryKeys: keys,
      },
      null,
      2,
    ),
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
