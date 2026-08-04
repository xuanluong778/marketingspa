import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class QueueEnqueueService {
  private readonly logger = new Logger(QueueEnqueueService.name);

  async add(queue: any, name: string, data: any, opts?: any): Promise<any> {
    if (!queue || typeof queue.add !== 'function') {
      this.logger.warn(`Queue missing for job ${name}`);
      return null;
    }
    return queue.add(name, data, opts);
  }
}
