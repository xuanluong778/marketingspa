const Redis = require('ioredis');
const url = process.env.REDIS_URL;
if (!url) {
  console.log('REDIS_PING=MISSING_URL');
  process.exit(1);
}
const r = new Redis(url, { connectTimeout: 5000, maxRetriesPerRequest: 1 });
r.ping()
  .then((x) => {
    console.log('REDIS_PING=' + x);
    return r.quit();
  })
  .catch((e) => {
    console.log('REDIS_PING=FAIL ' + e.message);
    process.exit(1);
  });
