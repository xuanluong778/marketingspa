/**
 * Smoke: resolve META_ADS_REDIRECT_URI from env + print authorize redirect_uri only.
 * Does not print secrets/tokens.
 */
import {
  MARKETINGAUTOAZ_META_ADS_OAUTH_REDIRECT_URI,
  resolveMetaAdsOAuthRedirectUri,
} from '../apps/api/src/ad-performance/facebook-ads/assert-meta-ads-oauth';

const uri = resolveMetaAdsOAuthRedirectUri((k) => process.env[k]);
const params = new URLSearchParams({
  client_id: 'APP_ID',
  redirect_uri: uri,
  state: 'STATE',
  scope: 'ads_read,ads_management',
  response_type: 'code',
});
const dialog = `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
const parsed = new URL(dialog);

console.log(
  JSON.stringify(
    {
      canonical: MARKETINGAUTOAZ_META_ADS_OAUTH_REDIRECT_URI,
      resolved: uri,
      match: uri === MARKETINGAUTOAZ_META_ADS_OAUTH_REDIRECT_URI,
      dialog_redirect_uri: parsed.searchParams.get('redirect_uri'),
      same_as_exchange: parsed.searchParams.get('redirect_uri') === uri,
    },
    null,
    2,
  ),
);

if (uri !== MARKETINGAUTOAZ_META_ADS_OAUTH_REDIRECT_URI) {
  process.exit(1);
}
