#!/usr/bin/env node
/**
 * Meta App Review — pages_manage_posts runtime audit
 *
 *   pnpm test:pages-manage-posts-review
 *
 * Live Graph publish + duplicate idempotency + UI wiring static gates.
 */
'use strict';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { META_FANPAGE_OAUTH_SCOPES } from '../apps/api/src/meta/meta-oauth-config';
import { getFacebookReviewCopy } from '../apps/web/src/lib/facebook-review-copy';
import { resolveFacebookPostUrl } from '../apps/web/src/lib/resolve-facebook-post-url';
import { decryptSecret } from '../apps/api/src/common/utils/encryption.util';

const ROOT = join(import.meta.dirname ?? __dirname, '..');
const prisma = new PrismaClient();

function read(rel: string) {
  return readFileSync(join(ROOT, rel), 'utf8');
}

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  try {
    for (const line of read('.env').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#') || !t.includes('=')) continue;
      const i = t.indexOf('=');
      env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    /* optional */
  }
  return env;
}

function gate(label: string, ok: boolean, detail?: string) {
  console.log(`${label} = ${ok ? 'PASS' : 'FAIL'}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

async function api(path: string, token: string, init?: RequestInit) {
  const env = loadEnv();
  const API = (env.API_URL || 'http://127.0.0.1:4000').replace(/\/$/, '');
  const res = await fetch(`${API}/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  const env = loadEnv();
  const SITE = (env.APP_URL || 'https://marketingautoaz.com').replace(/\/$/, '');
  const GRAPH = env.META_API_VERSION || 'v21.0';
  const ENCRYPTION_KEY = env.ENCRYPTION_KEY || '';
  const email = (env.META_REVIEWER_EMAIL || '').trim();
  const password = (env.META_REVIEWER_PASSWORD || '').trim();

  const enCopy = getFacebookReviewCopy('en');
  const library = read('apps/web/src/components/content-auto-post/auto-post-from-library-panel.tsx');
  const manual = read('apps/web/src/components/content-auto-post/auto-post-manual-panel.tsx');
  const publishUi = read('apps/web/src/components/content-auto-post/auto-post-publish-result.tsx');
  const toastUi = read('apps/web/src/components/content-auto-post/auto-post-success-toast.tsx');
  const integration = read('apps/web/src/app/facebook-integration/page.tsx');
  const reviewerDoc = read('docs/meta-app-review/REVIEWER_INSTRUCTIONS_EN.md');

  const scopeExisting =
    META_FANPAGE_OAUTH_SCOPES.includes('pages_manage_posts') &&
    META_FANPAGE_OAUTH_SCOPES.includes('pages_show_list') &&
    META_FANPAGE_OAUTH_SCOPES.includes('pages_read_engagement');
  gate('PAGES_MANAGE_POSTS_SCOPE_EXISTING', scopeExisting, 'META_FANPAGE_OAUTH_SCOPES');

  const connectedPageUi =
    library.includes('AutoPostSelectedPageChip') &&
    manual.includes('AutoPostSelectedPageChip') &&
    library.includes('FacebookFanpagePreview') &&
    library.includes('selectedPage?.pageName');
  gate('CONNECTED_PAGE_UI', connectedPageUi, 'selected page chip + preview name/avatar');

  const publishLoading =
    library.includes('mutations.publishNow.isPending') &&
    manual.includes('mutations.publishNow.isPending') &&
    library.includes('Loader2');
  gate('PUBLISH_LOADING', publishLoading, 'Loader2 while publishNow pending');

  const publishToastOk =
    enCopy.autoPost.publishSuccessToast === 'Published to Facebook successfully' &&
    library.includes('showPublishToast(fb.publishSuccessToast)') &&
    manual.includes('showPublishToast(fb.publishSuccessToast)') &&
    toastUi.includes('data-auto-post-publish-toast');
  gate('PUBLISH_SUCCESS_TOAST', publishToastOk, 'EN toast + wiring');

  const postIdUi =
    publishUi.includes('facebookPostId') &&
    publishUi.includes('AutoPostPublishResultBanner') &&
    library.includes('AutoPostPublishResultBanner') &&
    manual.includes('AutoPostPublishResultBanner');

  const viewOnFacebookUi =
    enCopy.autoPost.viewOnFacebook === 'View on Facebook' &&
    publishUi.includes('data-auto-post-view-on-facebook') &&
    publishUi.includes('resolveFacebookPostUrl');

  const englishFlow =
    enCopy.autoPost.publishNow === 'Publish now' &&
    enCopy.autoPost.publishSetupTitle === 'Publish settings' &&
    !library.includes('Thiết lập đăng') &&
    !library.includes('Caption (duyệt trước khi đăng)') &&
    library.includes('fb.pickFromLibraryHeading') &&
    reviewerDoc.includes('pages_manage_posts');
  gate('ENGLISH_REVIEWER_FLOW', englishFlow, 'EN copy + doc mention');

  const errorHandling =
    read('apps/web/src/lib/humanize-facebook-channel-error.ts').includes('pages_manage_posts') &&
    read('apps/api/src/auto-post/auto-post-user-facing-errors.ts').includes('pages_manage_posts');
  gate('ERROR_HANDLING', errorHandling, 'reviewer-friendly permission errors');

  const showListStatic =
    read('apps/api/src/auto-post/assert-auto-post-meta-oauth.ts').includes('2006772376877449') &&
    read('apps/web/src/components/content-auto-post/auto-post-channels-panel.tsx').includes(
      't.selectPagesTitle',
    );
  gate('PAGES_SHOW_LIST_REGRESSION', showListStatic, 'OAuth config + EN picker unchanged');

  let textOnlyPublish = false;
  let graphRealPublish = false;
  let correctPostOnFacebook = false;
  let duplicateProtection = false;
  let facebookPostIdLive = false;

  if (email && password) {
    const login = await fetch(`${(env.API_URL || 'http://127.0.0.1:4000').replace(/\/$/, '')}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const loginJson = (await login.json()) as { accessToken?: string };
    const accessToken = loginJson.accessToken;

    if (accessToken) {
      const me = await api('/auth/me', accessToken);
      const user = (me.json?.data ?? me.json) as { id?: string; organizationId?: string };

      const st = await api('/auto-post/facebook/status', accessToken);
      const sj = (st.json?.data ?? st.json) as {
        connected?: boolean;
        pages?: Array<{ id: string; pageId: string; pageName?: string }>;
      };
      const page = sj.pages?.[0];

      if (page?.id) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const draft = await api('/auto-post/drafts', accessToken, {
          method: 'POST',
          body: JSON.stringify({
            postType: 'PROMOTION',
            topic: `pages_manage_posts audit ${stamp}`,
            caption: `[Meta App Review — pages_manage_posts] Text-only publish audit ${stamp}. Safe to delete.`,
            fanpageId: page.id,
          }),
        });
        const postId = (draft.json as { id?: string }).id;

        if (postId && draft.status < 400) {
          const pub1 = await api('/auto-post/publish', accessToken, {
            method: 'POST',
            body: JSON.stringify({ postId, fanpageIds: [page.id] }),
          });
          const p1 = pub1.json as {
            status?: string;
            facebookPostId?: string;
            facebookPermalink?: string;
            facebookPostUrl?: string;
            fanpagePageId?: string;
          };

          textOnlyPublish =
            (pub1.status === 200 || pub1.status === 201) &&
            p1.status === 'PUBLISHED' &&
            Boolean(p1.facebookPostId);
          graphRealPublish = textOnlyPublish;
          facebookPostIdLive = Boolean(p1.facebookPostId);

          const postUrl = resolveFacebookPostUrl(p1);
          gate(
            'TEXT_ONLY_PUBLISH',
            textOnlyPublish,
            textOnlyPublish ? `fbPostId=${p1.facebookPostId}` : `status=${pub1.status}`,
          );
          gate(
            'GRAPH_API_REAL_PUBLISH',
            graphRealPublish,
            graphRealPublish ? `permalink=${p1.facebookPermalink ?? postUrl ?? '-'}` : 'no publish',
          );
          gate(
            'FACEBOOK_POST_ID',
            facebookPostIdLive && postIdUi,
            facebookPostIdLive ? `live id=${p1.facebookPostId}; ui=${postIdUi}` : 'missing live id',
          );

          if (textOnlyPublish && p1.facebookPostId && ENCRYPTION_KEY && user.id && user.organizationId) {
            const conn = await prisma.autoPostFacebookConnection.findUnique({
              where: {
                userId_organizationId: {
                  userId: user.id,
                  organizationId: user.organizationId,
                },
              },
              include: { pages: { where: { id: page.id } } },
            });
            const fp = conn?.pages[0];
            if (fp?.encryptedPageAccessToken) {
              try {
                const token = decryptSecret(fp.encryptedPageAccessToken, ENCRYPTION_KEY);
                const gRes = await fetch(
                  `https://graph.facebook.com/${GRAPH}/${encodeURIComponent(p1.facebookPostId)}?fields=id,is_published,permalink_url,message&access_token=${encodeURIComponent(token)}`,
                );
                const gBody = (await gRes.json()) as {
                  id?: string;
                  is_published?: boolean;
                  permalink_url?: string;
                  message?: string;
                };
                correctPostOnFacebook =
                  gRes.ok &&
                  Boolean(gBody.id) &&
                  gBody.is_published !== false &&
                  Boolean(gBody.permalink_url || postUrl);
                gate(
                  'VIEW_ON_FACEBOOK',
                  viewOnFacebookUi && Boolean(postUrl || gBody.permalink_url),
                  postUrl || gBody.permalink_url || 'no url',
                );
                gate(
                  'CORRECT_POST_ON_FACEBOOK',
                  correctPostOnFacebook,
                  correctPostOnFacebook
                    ? `graph id=${gBody.id}`
                    : `graph status=${gRes.status}`,
                );
              } catch (e) {
                gate('CORRECT_POST_ON_FACEBOOK', false, String(e));
                gate('VIEW_ON_FACEBOOK', viewOnFacebookUi, 'graph verify failed');
              }
            } else {
              gate('CORRECT_POST_ON_FACEBOOK', false, 'no page token');
              gate('VIEW_ON_FACEBOOK', viewOnFacebookUi, 'no page token');
            }
          } else {
            gate('CORRECT_POST_ON_FACEBOOK', false, 'skipped graph verify');
            gate('VIEW_ON_FACEBOOK', viewOnFacebookUi, 'skipped graph verify');
          }

          const pub2 = await api('/auto-post/publish', accessToken, {
            method: 'POST',
            body: JSON.stringify({ postId, fanpageIds: [page.id] }),
          });
          const p2 = pub2.json as { facebookPostId?: string; status?: string };
          duplicateProtection =
            (pub2.status === 200 || pub2.status === 201) &&
            p2.facebookPostId === p1.facebookPostId &&
            p2.status === 'PUBLISHED';
          gate(
            'DUPLICATE_PROTECTION',
            duplicateProtection,
            duplicateProtection
              ? `same id ${p1.facebookPostId}`
              : `first=${p1.facebookPostId} second=${p2.facebookPostId ?? '-'}`,
          );
        } else {
          gate('TEXT_ONLY_PUBLISH', false, `draft failed status=${draft.status}`);
          gate('GRAPH_API_REAL_PUBLISH', false, 'no draft');
          gate('CORRECT_POST_ON_FACEBOOK', false, 'blocked');
          gate('DUPLICATE_PROTECTION', false, 'blocked');
        }
      } else {
        gate('TEXT_ONLY_PUBLISH', false, 'no connected page');
        gate('GRAPH_API_REAL_PUBLISH', false, 'no connected page');
        gate('CORRECT_POST_ON_FACEBOOK', false, 'no connected page');
        gate('DUPLICATE_PROTECTION', false, 'no connected page');
      }

      // pages_read_engagement regression — sync only, no oauth/start
      if (sj.pages?.[0]?.id) {
        const sync = await api(`/auto-post/facebook/pages/${sj.pages[0].id}/sync`, accessToken, {
          method: 'POST',
        });
        const body = (sync.json?.data ?? sync.json) as { dataSource?: string; lastSyncedAt?: string };
        gate(
          'PAGES_READ_ENGAGEMENT_REGRESSION',
          sync.status === 200 && body.dataSource === 'live' && Boolean(body.lastSyncedAt),
          `sync status=${sync.status}`,
        );
      } else {
        gate('PAGES_READ_ENGAGEMENT_REGRESSION', false, 'no page');
      }
    } else {
      gate('TEXT_ONLY_PUBLISH', false, 'login failed');
      gate('GRAPH_API_REAL_PUBLISH', false, 'login failed');
      gate('PAGES_READ_ENGAGEMENT_REGRESSION', false, 'login failed');
    }
  } else {
    console.log('SKIP live — no META_REVIEWER creds');
    gate('TEXT_ONLY_PUBLISH', false, 'no creds');
    gate('GRAPH_API_REAL_PUBLISH', false, 'no creds');
    gate('CORRECT_POST_ON_FACEBOOK', false, 'no creds');
    gate('DUPLICATE_PROTECTION', false, 'no creds');
    gate('PAGES_READ_ENGAGEMENT_REGRESSION', false, 'no creds');
  }

  const otherModules =
    read('apps/web/src/config/navigation.ts').includes('Marketing Autopilot') &&
    !read('apps/api/src/auto-post/auto-post.service.ts').includes('MarketingAutopilotOrchestrator');
  gate('OTHER_MODULES_UNCHANGED', otherModules, 'nav intact; auto-post svc isolated');

  let integrationLive = false;
  try {
    const html = await fetch(`${SITE}/facebook-integration`).then((r) => r.text());
    integrationLive =
      html.includes('pages_manage_posts') && html.includes('Sync Page from Facebook');
  } catch {
    integrationLive = false;
  }
  gate('INTEGRATION_DOC_LIVE', integrationLive, `${SITE}/facebook-integration`);

  const metaReady =
    scopeExisting &&
    connectedPageUi &&
    publishLoading &&
    publishToastOk &&
    postIdUi &&
    viewOnFacebookUi &&
    englishFlow &&
    errorHandling &&
    showListStatic &&
    textOnlyPublish &&
    graphRealPublish &&
    correctPostOnFacebook &&
    duplicateProtection &&
    integrationLive;

  console.log(`\nMETA_REVIEW_READY_PAGES_MANAGE_POSTS = ${metaReady ? 'PASS' : 'FAIL'}`);
  await prisma.$disconnect();
  process.exit(metaReady ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
