import { createHash } from 'crypto';
export function hashSignal(value?: string | null): string {
  return createHash('sha256').update(String(value || '')).digest('hex');
}
