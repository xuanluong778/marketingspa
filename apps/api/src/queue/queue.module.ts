import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@marketingspa/shared';
import {
  AUTOMATION_MESSAGE_QUEUE,
  APPOINTMENT_REMINDER_QUEUE,
  AUTO_POST_QUEUE,
  BACKUP_QUEUE,
  CAMPAIGN_QUEUE,
  DAILY_REPORT_QUEUE,
  HRM_ATTENDANCE_REBUILD_QUEUE,
  LEAD_ALERT_QUEUE,
} from './queue.constants';

function createQueueProvider(token: string, queueName: string) {
  return {
    provide: token,
    inject: [ConfigService],
    useFactory: (config: ConfigService) => {
      const prefix = config.get<string>('QUEUE_PREFIX', 'marketingspa');
      const redisUrl = config.get<string>('REDIS_URL', 'redis://localhost:6379');
      return new Queue(queueName, {
        connection: { url: redisUrl, maxRetriesPerRequest: null },
        prefix,
      });
    },
  };
}

@Global()
@Module({
  providers: [
    createQueueProvider(CAMPAIGN_QUEUE, QUEUE_NAMES.CAMPAIGN_SEND),
    createQueueProvider(LEAD_ALERT_QUEUE, QUEUE_NAMES.LEAD_ALERT),
    createQueueProvider(APPOINTMENT_REMINDER_QUEUE, QUEUE_NAMES.APPOINTMENT_REMINDER),
    createQueueProvider(AUTOMATION_MESSAGE_QUEUE, QUEUE_NAMES.AUTOMATION_MESSAGE),
    createQueueProvider(DAILY_REPORT_QUEUE, QUEUE_NAMES.DAILY_REPORT),
    createQueueProvider(BACKUP_QUEUE, QUEUE_NAMES.BACKUP),
    createQueueProvider(AUTO_POST_QUEUE, QUEUE_NAMES.AUTO_POST_PUBLISH),
    createQueueProvider(HRM_ATTENDANCE_REBUILD_QUEUE, QUEUE_NAMES.HRM_ATTENDANCE_REBUILD),
  ],
  exports: [
    CAMPAIGN_QUEUE,
    LEAD_ALERT_QUEUE,
    APPOINTMENT_REMINDER_QUEUE,
    AUTOMATION_MESSAGE_QUEUE,
    DAILY_REPORT_QUEUE,
    BACKUP_QUEUE,
    AUTO_POST_QUEUE,
    HRM_ATTENDANCE_REBUILD_QUEUE,
  ],
})
export class QueueModule {}
