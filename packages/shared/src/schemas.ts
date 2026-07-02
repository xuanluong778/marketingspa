import { z } from 'zod';
import { CAMPAIGN_STATUS, USER_ROLE } from './constants';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const createCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  channel: z.enum(['EMAIL', 'SMS', 'ZALO']),
  scheduledAt: z.string().datetime().optional(),
  contactIds: z.array(z.string().uuid()).min(1),
});

export const createContactSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional(),
  phone: z.string().min(9).max(15).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type CreateContactInput = z.infer<typeof createContactSchema>;

export { CAMPAIGN_STATUS, USER_ROLE };
