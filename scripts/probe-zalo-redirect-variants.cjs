/**
 * Probe Zalo OA authorize -14003 by using a deliberately wrong redirect
 * vs our production redirect, with encoding variants. No secrets logged.
 */
const APP_ID = process.env.ZALO_APP_ID;
const GOOD =
  'https://marketingautoaz.com/api/v1/zalo-marketing/public/oauth/callback';
const BAD = 'https://example.com/callback';

function enc(uri) {
  return encodeURIComponent(uri);
}

async function hit(label, url) {
  const res = await fetch(url, {
    redirect: 'manual',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  const loc = res.headers.get('location') || '';
  let body = '';
  if (res.status === 200) body = (await res.text()).slice(0, 1500);
  const hit14003 =
    loc.includes('-14003') ||
    body.includes('-14003') ||
    /invalid\s*redirect/i.test(loc) ||
    /invalid\s*redirect/i.test(body);
  let locHost = '';
  let locPath = '';
  try {
    const u = new URL(loc, url);
    locHost = u.host;
    locPath = u.pathname + (u.search ? '?…' : '');
  } catch {
    /* ignore */
  }
  return {
    label,
    status: res.status,
    locHost,
    locPath: locPath.slice(0, 120),
    hit14003,
  };
}

(async () => {
  const variants = [
    [
      'good_enc_std',
      `https://oauth.zaloapp.com/v4/oa/permission?app_id=${APP_ID}&redirect_uri=${enc(GOOD)}`,
    ],
    [
      'good_raw',
      `https://oauth.zaloapp.com/v4/oa/permission?app_id=${APP_ID}&redirect_uri=${GOOD}`,
    ],
    [
      'good_enc_plus_state',
      `https://oauth.zaloapp.com/v4/oa/permission?app_id=${APP_ID}&redirect_uri=${enc(GOOD)}&state=abc`,
    ],
    [
      'good_enc_long_state',
      `https://oauth.zaloapp.com/v4/oa/permission?app_id=${APP_ID}&redirect_uri=${enc(GOOD)}&state=${'a'.repeat(400)}`,
    ],
    [
      'good_pkce',
      `https://oauth.zaloapp.com/v4/oa/permission?app_id=${APP_ID}&redirect_uri=${enc(GOOD)}&code_challenge=abc&code_challenge_method=S256`,
    ],
    [
      'good_origin_only',
      `https://oauth.zaloapp.com/v4/oa/permission?app_id=${APP_ID}&redirect_uri=${enc('https://marketingautoaz.com')}`,
    ],
    [
      'good_slash',
      `https://oauth.zaloapp.com/v4/oa/permission?app_id=${APP_ID}&redirect_uri=${enc(GOOD + '/')}`,
    ],
    [
      'good_www',
      `https://oauth.zaloapp.com/v4/oa/permission?app_id=${APP_ID}&redirect_uri=${enc('https://www.marketingautoaz.com/api/v1/zalo-marketing/public/oauth/callback')}`,
    ],
    [
      'good_short',
      `https://oauth.zaloapp.com/v4/oa/permission?app_id=${APP_ID}&redirect_uri=${enc('https://marketingautoaz.com/zalo/oauth/callback')}`,
    ],
    [
      'good_no_redirect',
      `https://oauth.zaloapp.com/v4/oa/permission?app_id=${APP_ID}`,
    ],
    [
      'bad_enc',
      `https://oauth.zaloapp.com/v4/oa/permission?app_id=${APP_ID}&redirect_uri=${enc(BAD)}`,
    ],
    [
      'user_login_flow',
      `https://oauth.zaloapp.com/v4/permission?app_id=${APP_ID}&redirect_uri=${enc(GOOD)}`,
    ],
  ];

  const out = [];
  for (const [label, url] of variants) {
    out.push(await hit(label, url));
  }
  console.log(JSON.stringify(out, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
