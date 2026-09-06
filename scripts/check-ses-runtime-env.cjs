#!/usr/bin/env node
/** Print SES runtime env status without secret values. */
const keys = [
  'EMAIL_PROVIDER',
  'AWS_REGION',
  'SES_FROM_EMAIL',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_PROFILE',
  'SES_CONFIGURATION_SET',
  'SES_SNS_TOPIC_ARN',
  'SES_SNS_WEBHOOK_TEST_SIGNING_KEY',
];

for (const k of keys) {
  const v = (process.env[k] || '').trim();
  if (!v) {
    console.log(`${k}: [empty]`);
    continue;
  }
  if (k.includes('SECRET') || k === 'AWS_ACCESS_KEY_ID') {
    console.log(`${k}: [set,len=${v.length}]`);
  } else if (k === 'SES_SNS_WEBHOOK_TEST_SIGNING_KEY') {
    console.log(`${k}: [set,len=${v.length}]`);
  } else {
    console.log(`${k}: ${v}`);
  }
}
