import { scanAndEnqueueGoogleAutoSync } from '../lib/ads-sync-enqueue';

/** Daily scan: enqueue Google Ads sync for all connected tenants (BullMQ, not HTTP). */
export async function processAdsAutoSyncScan() {
  const result = await scanAndEnqueueGoogleAutoSync();
  console.log(
    `[ads-auto-sync] scanned=${result.scanned} queued=${result.queued} skipped=${result.skipped}`,
  );
  return result;
}
