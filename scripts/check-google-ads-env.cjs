const keys = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_ADS_DEVELOPER_TOKEN',
  'GOOGLE_ADS_REDIRECT_URI',
  'GOOGLE_ADS_API_VERSION',
  'ADS_ACTIONS_LIVE',
  'ADS_ACTIONS_PROVIDER_WRITE',
  'REDIS_URL',
  'DATABASE_URL',
  'ENCRYPTION_KEY',
  'JWT_SECRET',
  'APP_URL',
];
for (const k of keys) {
  const v = process.env[k];
  if (!v) console.log(`${k}=MISSING`);
  else if (v.length === 0) console.log(`${k}=EMPTY`);
  else console.log(`${k}=SET(${v.length} chars)`);
}
