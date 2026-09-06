'use client';

import { getFacebookReviewCopy } from '@/lib/facebook-review-copy';
import { useFacebookReviewLocale } from '@/lib/facebook-review-locale';

export function useFacebookCopy() {
  const locale = useFacebookReviewLocale();
  const copy = getFacebookReviewCopy(locale);
  return { locale, copy, t: copy.fanpage, autoPost: copy.autoPost, messenger: copy.messenger, ads: copy.ads };
}
