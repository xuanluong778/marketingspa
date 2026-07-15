import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@marketingspa/shared';
import { bullConnection, queuePrefix } from '../config';

const connection = bullConnection;

export async function registerRepeatableJobs() {
  const queues = {
    leadAlert: new Queue(QUEUE_NAMES.LEAD_ALERT, { connection, prefix: queuePrefix }),
    appointmentReminder: new Queue(QUEUE_NAMES.APPOINTMENT_REMINDER, {
      connection,
      prefix: queuePrefix,
    }),
    dailyReport: new Queue(QUEUE_NAMES.DAILY_REPORT, { connection, prefix: queuePrefix }),
    backup: new Queue(QUEUE_NAMES.BACKUP, { connection, prefix: queuePrefix }),
  };

  await queues.leadAlert.add(
    'scan-stale-leads',
    {},
    { repeat: { pattern: '*/5 * * * *' }, jobId: 'lead-alert-scan' },
  );

  await queues.appointmentReminder.add(
    'scan-reminders',
    {},
    { repeat: { pattern: '*/15 * * * *' }, jobId: 'appointment-reminder-scan' },
  );

  await queues.dailyReport.add(
    'generate',
    {},
    { repeat: { pattern: '0 6 * * *' }, jobId: 'daily-report-generate' },
  );

  await queues.backup.add(
    'run-backup',
    {},
    { repeat: { pattern: '0 2 * * *' }, jobId: 'daily-backup' },
  );

  const autoPostQueue = new Queue(QUEUE_NAMES.AUTO_POST_PUBLISH, {
    connection,
    prefix: queuePrefix,
  });
  await autoPostQueue.add(
    'scan-due-scheduled',
    {},
    { repeat: { pattern: '* * * * *' }, jobId: 'auto-post-scan-due' },
  );

  console.log('[scheduler] Repeatable jobs registered');

  await Promise.all([...Object.values(queues).map((q) => q.close()), autoPostQueue.close()]);
}
