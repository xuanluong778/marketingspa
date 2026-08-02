import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@marketingspa/shared';
import { bullConnection, queuePrefix } from '../config';

const queueCache = new Map<string, Queue>();

export function getWorkerQueue(name: string): Queue {
  const existing = queueCache.get(name);
  if (existing) return existing;
  const queue = new Queue(name, { connection: bullConnection, prefix: queuePrefix });
  queueCache.set(name, queue);
  return queue;
}

export const dispatchQueue = () => getWorkerQueue(QUEUE_NAMES.MESSAGING_CAMPAIGN_DISPATCH);
export const sendQueue = () => getWorkerQueue(QUEUE_NAMES.MESSAGING_SEND);
