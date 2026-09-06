/**
 * Ensure SES Configuration Set + SNS event destination (Send/Delivery/Bounce/Complaint/Reject).
 *   node scripts/with-root-env.cjs pnpm --filter @marketingspa/shared exec tsx ../../scripts/provision-ses-event-loop.ts
 */
import {
  inspectSesEventLoop,
  provisionSesEventLoop,
  sesEventLoopEnvGap,
} from '../packages/shared/dist/ses-event-loop';

async function main() {
  const gap = sesEventLoopEnvGap();
  if (gap.length) {
    console.error(`FAIL  missing env: ${gap.join(', ')}`);
    process.exit(1);
  }

  const before = await inspectSesEventLoop();
  console.log('Before:', JSON.stringify(before, null, 2));

  const result = await provisionSesEventLoop();
  if (!result) {
    console.error('FAIL  provisionSesEventLoop returned null');
    process.exit(1);
  }

  console.log('Provision:', {
    createdConfigurationSet: result.createdConfigurationSet,
    createdEventDestination: result.createdEventDestination,
  });
  console.log('After:', JSON.stringify(result.status, null, 2));

  if (!result.status.eventDestinationOk) {
    console.error('FAIL  event destination incomplete');
    process.exit(1);
  }
  console.log('PASS  SES event loop ready');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
