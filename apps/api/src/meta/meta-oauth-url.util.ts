import type { MetaOAuthFlow } from './meta-oauth-config';
import {
  resolveMetaLoginConfigIdForFlow,
  scopesForMetaOAuthFlow,
} from './meta-oauth-config';

export type BuildMetaOAuthUrlInput = {
  flow: MetaOAuthFlow;
  appId: string;
  redirectUri: string;
  state: string;
  apiVersion: string;
  getEnv: (key: string) => string | undefined;
  /** Chỉ fanpage: append scope khi META_OAUTH_APPEND_SCOPES=true */
  allowAppendScopesWithConfigId?: boolean;
};

/**
 * Facebook Login for Business (config_id) hoặc Standard Login (scope=).
 * Không truyền scope=pages_* kèm config_id trừ khi explicitly allowed.
 */
export function buildMetaOAuthAuthorizeUrl(input: BuildMetaOAuthUrlInput): string {
  const params = new URLSearchParams({
    client_id: input.appId,
    redirect_uri: input.redirectUri,
    state: input.state,
    response_type: 'code',
  });

  if (input.flow === 'fanpage' || input.flow === 'messenger') {
    params.set('display', 'page');
    params.set('auth_type', 'rerequest');
    params.set('return_scopes', 'true');
  }

  const configId = resolveMetaLoginConfigIdForFlow(input.flow, input.getEnv);
  if (configId) {
    params.set('config_id', configId);
    if (input.flow === 'fanpage') {
      const overrideDefault =
        (input.getEnv('META_LOGIN_OVERRIDE_DEFAULT_RESPONSE_TYPE') ?? '')
          .trim()
          .toLowerCase() === 'true';
      if (overrideDefault) {
        params.set('override_default_response_type', 'true');
      }
      const appendScopes =
        input.allowAppendScopesWithConfigId &&
        (input.getEnv('META_OAUTH_APPEND_SCOPES') ?? 'false').trim().toLowerCase() === 'true';
      if (appendScopes) {
        params.set('scope', [...scopesForMetaOAuthFlow(input.flow)].join(','));
      }
    }
  } else {
    params.set('scope', [...scopesForMetaOAuthFlow(input.flow)].join(','));
  }

  return `https://www.facebook.com/${input.apiVersion}/dialog/oauth?${params.toString()}`;
}
