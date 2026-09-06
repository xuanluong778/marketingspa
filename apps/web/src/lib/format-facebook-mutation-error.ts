import { formatMutationError } from '@/lib/format-mutation-error';
import { humanizeFacebookChannelError } from '@/lib/humanize-facebook-channel-error';
import type { FacebookReviewLocale } from '@/lib/facebook-review-locale';

/** Format API errors for Facebook UI — humanize backend codes when shown to users. */
export function formatFacebookMutationError(
  error: unknown,
  locale: FacebookReviewLocale,
  fallback: string,
): string {
  const raw = formatMutationError(error, fallback);
  return humanizeFacebookChannelError(raw, fallback, locale);
}
