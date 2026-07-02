import { AdPlatform } from '@marketingspa/database';

/** Map ad platform → lead source codes trong DB seed */
const PLATFORM_SOURCE_CODES: Record<AdPlatform, string[]> = {
  [AdPlatform.META]: ['facebook'],
  [AdPlatform.GOOGLE]: ['google'],
  [AdPlatform.TIKTOK]: ['tiktok'],
  [AdPlatform.ZALO]: ['zalo'],
  [AdPlatform.MANUAL]: [],
  [AdPlatform.OTHER]: [],
};

export function leadSourceCodesForPlatform(platform: AdPlatform): string[] {
  return PLATFORM_SOURCE_CODES[platform] ?? [];
}
