#!/usr/bin/env node
/**
 * Meta App Review readiness — pages_read_engagement
 *
 *   pnpm test:pages-read-engagement-review
 *
 * Gates: OAuth scope → connected Page → Sync → Graph live → persist → EN UI copy
 */
'use strict';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { META_FANPAGE_OAUTH_SCOPES } from '../apps/api/src/meta/meta-oauth-config';
import { getFacebookReviewCopy } from '../apps/web/src/lib/facebook-review-copy';

const ROOT = join(import.meta.dirname ?? __dirname, '..');

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

function hasTokenLeak(obj: unknown): boolean {
  const s = JSON.stringify(obj);
  return (
    /encryptedPageAccessToken|access_token|"token"\s*:/i.test(s) ||
    /\b(?:EAAG|EAAD|EAA)[A-Za-z0-9_-]{20,}\b/.test(s)
  );
}

async function main() {
  const env = loadEnv();
  const API = (env.API_URL || 'http://127.0.0.1:4000').replace(/\/$/, '');
  const SITE = (env.APP_URL || 'https://marketingautoaz.com').replace(/\/$/, '');

  const scopesOk =
    META_FANPAGE_OAUTH_SCOPES.includes('pages_read_engagement') &&
    META_FANPAGE_OAUTH_SCOPES.includes('pages_show_list') &&
    META_FANPAGE_OAUTH_SCOPES.includes('pages_manage_posts') &&
    !META_FANPAGE_OAUTH_SCOPES.includes('ads_read' as never);
  gate('PAGES_READ_ENGAGEMENT_SCOPE', scopesOk, 'META_FANPAGE_OAUTH_SCOPES');

  const svc = read('apps/api/src/auto-post/auto-post-facebook-page-details.service.ts');
  const graphReal =
    svc.includes('published_posts') &&
    svc.includes('FANPAGE_DETAILS_PAGE_FIELDS') &&
    svc.includes("dataSource: 'live'") &&
    !/mockPage|fakeGraph|FAKE_GRAPH/i.test(svc);
  gate('GRAPH_API_REAL_DATA', graphReal, 'page-details.service live Graph');

  const enCopy = getFacebookReviewCopy('en');
  const enOk =
    enCopy.fanpage.syncPageInfo === 'Sync Page from Facebook' &&
    enCopy.fanpage.syncSuccessToast === 'Synced from Facebook successfully' &&
    enCopy.fanpage.viewDetails === 'View details' &&
    enCopy.fanpage.refreshFromFacebook === 'Refresh from Facebook' &&
    /pages_read_engagement/i.test(enCopy.fanpage.scopeReadEngagementBody) &&
    JSON.stringify(enCopy).includes('Select Facebook Pages to connect') &&
    JSON.stringify(enCopy).includes('Connected Facebook Page');
  const panel = read('apps/web/src/components/content-auto-post/auto-post-channels-panel.tsx');
  const drawer = read('apps/web/src/components/content-auto-post/fanpage-details-drawer.tsx');
  const toastHook = read('apps/web/src/components/content-auto-post/fanpage-sync-toast.tsx');
  const uiWired =
    panel.includes('t.syncPageInfo') &&
    panel.includes('t.viewDetails') &&
    panel.includes('t.syncSuccessToast') &&
    panel.includes('useFanpageSyncToast') &&
    drawer.includes('t.syncSuccess') &&
    drawer.includes('t.syncSuccessToast') &&
    drawer.includes('useFanpageSyncToast') &&
    drawer.includes('successToast: true') &&
    drawer.includes('t.pageInfo') &&
    drawer.includes('t.postsFromFacebook');
  gate('PAGE_DETAILS_RENDER', enOk && uiWired, 'EN copy + drawer/panel wiring');

  const syncToastOk =
    enCopy.fanpage.syncSuccessToast === 'Synced from Facebook successfully' &&
    toastHook.includes('data-fanpage-sync-toast="success"') &&
    panel.includes('showSyncToast(t.syncSuccessToast)') &&
    drawer.includes('showSyncToast(t.syncSuccessToast)');
  gate('SYNC_SUCCESS_TOAST', syncToastOk, 'EN toast copy + drawer/panel hook');

  const integration = read('apps/web/src/app/facebook-integration/page.tsx');
  const docsOk =
    integration.includes('pages_read_engagement') &&
    integration.includes('Sync Page from Facebook') &&
    integration.includes('retrieve and display') &&
    integration.includes('engagement data') &&
    !integration.includes('Kết nối Facebook') &&
    !integration.includes('Ngắt kết nối');
  gate('ENGLISH_REVIEWER_FLOW', docsOk && enOk, 'facebook-integration + EN copy');

  const errorOk =
    svc.includes('permission_missing') &&
    svc.includes('expired_token') &&
    svc.includes('snapshotHasTokenLeak') &&
    read('apps/web/src/lib/humanize-facebook-channel-error.ts').includes('pages_read_engagement');
  gate('ERROR_HANDLING', errorOk, 'typed Graph errors + no token leak helpers');

  // Live sync BEFORE any oauth/start tests (those reset connection to DISCONNECTED).
  let pageSync = false;
  let graphLive = false;
  let detailsRender = false;
  const email = (env.META_REVIEWER_EMAIL || '').trim();
  const password = (env.META_REVIEWER_PASSWORD || '').trim();
  if (email && password) {
    try {
      const login = await fetch(`${API}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const { accessToken } = (await login.json()) as { accessToken?: string };
      if (accessToken) {
        const h = { Authorization: `Bearer ${accessToken}` };
        const st = await fetch(`${API}/api/v1/auto-post/facebook/status`, { headers: h });
        const stRaw = (await st.json()) as Record<string, unknown>;
        const sj = (stRaw.data ?? stRaw) as {
          connected?: boolean;
          pages?: Array<{ id: string; pageName?: string; pageId?: string }>;
        };
        const page = sj.pages?.[0];
        if (page?.id) {
          const sync = await fetch(
            `${API}/api/v1/auto-post/facebook/pages/${page.id}/sync`,
            { method: 'POST', headers: h },
          );
          const syncRaw = (await sync.json()) as Record<string, unknown>;
          const body = (syncRaw.data ?? syncRaw) as {
            dataSource?: string;
            syncStatus?: string;
            lastSyncedAt?: string;
            page?: {
              name?: string;
              pageId?: string;
              pictureUrl?: string | null;
              category?: string | null;
              fanCount?: number | null;
              about?: string | null;
            };
            recentPosts?: unknown[];
            graphEndpoints?: { page?: string; posts?: string };
            code?: string;
            message?: string;
          };
          pageSync =
            sync.status === 200 &&
            body.dataSource === 'live' &&
            Boolean(body.lastSyncedAt);
          graphLive =
            pageSync &&
            Boolean(body.graphEndpoints?.page?.includes('graph.facebook.com')) &&
            Boolean(body.page?.name) &&
            Boolean(body.page?.pageId) &&
            body.syncStatus === 'Synced from Facebook' &&
            !hasTokenLeak(body);
          detailsRender =
            graphLive &&
            (Boolean(body.page?.pictureUrl) ||
              Boolean(body.page?.category) ||
              body.page?.fanCount != null ||
              Boolean(body.page?.about) ||
              Array.isArray(body.recentPosts));

          const det = await fetch(
            `${API}/api/v1/auto-post/facebook/pages/${page.id}/details`,
            { headers: h },
          );
          const detRaw = (await det.json()) as Record<string, unknown>;
          const dj = (detRaw.data ?? detRaw) as {
            dataSource?: string;
            page?: { name?: string; pageId?: string };
            lastSyncedAt?: string | null;
          };
          detailsRender =
            detailsRender &&
            det.status === 200 &&
            Boolean(dj.lastSyncedAt) &&
            dj.page?.pageId === body.page?.pageId;
        }
      }
    } catch (e) {
      console.log(`LIVE skip: ${(e as Error).message}`);
    }
  } else {
    console.log('SKIP live sync — no META_REVIEWER creds');
  }

  gate('PAGE_SYNC', pageSync, email ? 'POST /pages/:id/sync live' : 'no creds');
  if (email && password) {
    gate('GRAPH_API_REAL_DATA', graphReal && graphLive, 'code + live Graph response');
    gate('PAGE_DETAILS_RENDER', enOk && uiWired && detailsRender, 'UI wiring + live fields');
  }

  const showListStatic =
    read('apps/api/src/auto-post/assert-auto-post-meta-oauth.ts').includes(
      '2006772376877449',
    ) &&
    panel.includes('t.selectPagesTitle') &&
    panel.includes('t.connectSelected') &&
    JSON.stringify(enCopy).includes('Select Facebook Pages to connect');
  gate('PAGES_SHOW_LIST_REGRESSION', showListStatic, 'config_id + EN picker copy (no oauth/start)');

  const pagesReadRegression =
    scopesOk &&
    graphReal &&
    enOk &&
    uiWired &&
    syncToastOk &&
    docsOk &&
    errorOk &&
    (email && password ? pageSync && graphLive && detailsRender : true);
  gate('PAGES_READ_ENGAGEMENT_REGRESSION', pagesReadRegression, 'scope + sync + EN UI + toast');

  let integrationLive = false;
  try {
    const html = await fetch(`${SITE}/facebook-integration`).then((r) => r.text());
    integrationLive =
      html.includes('pages_read_engagement') &&
      html.includes('Sync Page from Facebook') &&
      html.includes('retrieve and display information');
  } catch {
    integrationLive = false;
  }
  gate('INTEGRATION_DOC_LIVE', integrationLive, `${SITE}/facebook-integration`);

  const otherModules =
    !svc.includes('MarketingAutopilot') &&
    read('apps/web/src/config/navigation.ts').includes('Marketing Autopilot');
  gate('OTHER_MODULES_UNCHANGED', otherModules, 'nav still has Autopilot; sync svc isolated');

  const metaReady =
    scopesOk &&
    graphReal &&
    (email ? pageSync && graphLive && detailsRender : true) &&
    enOk &&
    uiWired &&
    syncToastOk &&
    docsOk &&
    errorOk &&
    showListStatic &&
    integrationLive &&
    pagesReadRegression;

  console.log(`\nMETA_REVIEW_READY = ${metaReady ? 'PASS' : 'FAIL'}`);
  process.exit(metaReady ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
