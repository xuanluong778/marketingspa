# Meta App Review audit report — `pages_show_list`

**Date:** 2026-08-03  
**Branch:** `audit/meta-app-review-pages-show-list`  
**Rollback tag:** `audit/meta-app-review-pages-show-list-rollback` (`d31862b4aeee7a52c35d3fbef72e4c118e5c4897`)  
**Deploy:** **NONE** (no production deploy in this audit)  
**Product:** MarketingAutoAZ (`marketingautoaz.com`)

---

## Executive verdict

### **NO-GO** for Meta App Review submit of full live `pages_show_list` end-to-end

**Reason:** Automated + API smoke proves OAuth **start** config, reviewer gates, tenant isolation unit tests, and public HTTPS docs. This session did **not** complete an interactive Facebook Login for Business grant and verify a **live** Meta `/me/accounts` Page list → select → “Đã kết nối” in the browser with real Meta data.

Per requirement: *Only conclude GO when the entire `pages_show_list` flow works with real Meta data.*

**Closest status:** **CONDITIONAL READY** — fix remaining P1 items below, record the video checklist with a real Fanpage admin Facebook user, then re-run smoke → likely **GO**.

---

## PASS / FAIL checklist

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | Separate branch + rollback point; no prod deploy | **PASS** | Branch + tag `audit/meta-app-review-pages-show-list-rollback`; PM2/web not redeployed for this audit |
| 2 | Public `/privacy` → 200 HTTPS, no login wall | **PASS** | curl 200, ssl_verify=0, Let's Encrypt CN=marketingautoaz.com; header “Đăng nhập” link only (no password form) |
| 3 | Public `/terms` → 200 HTTPS, no login wall | **PASS** | Same |
| 4 | Public `/facebook/data-deletion` → 200 HTTPS | **PASS** | Same; `/data-deletion` 301→same page |
| 5 | Public `/facebook-integration` → 200 HTTPS | **PASS** | Documents `pages_show_list`, App ID, Config ID |
| 6 | Mobile UA public pages 200 | **PASS** | iPhone UA curl 200 on privacy + facebook-integration |
| 7 | Reviewer login (no OTP / payment / trial block) | **PASS** | `pnpm meta-reviewer:smoke` ALL_PASS; role OWNER; sub ACTIVE 1826d `msp-pro-6m` |
| 8 | Reviewer not platform admin | **PASS** | admin users API 403; role OWNER |
| 9 | Content Marketing + Auto Post status allowed | **PASS** | smoke: content industries 200; auto-post status 200 |
| 10 | OAuth start: Config ID / App ID / redirect | **PASS** | `audit-oauth-start-params.cjs` all_pass; `check-oauth-start-scopes.ts` has_config_id, no pages_* in scope= |
| 11 | No localhost / seoauto in OAuth URL | **PASS** | contains_forbidden=[] |
| 12 | Canary allowlist includes reviewer org | **PASS** | org_in_canary=true; `OAUTH_CONNECTION=true` |
| 13 | Pending-then-select; no auto-connect unselected | **PASS** (code + unit) | `test-auto-post-facebook-login-for-business` |
| 14 | Tenant isolation / fake pageId rejected | **PASS** (unit) | Same suite |
| 15 | Live Graph list → select → “Đã kết nối” → disconnect (browser, real Meta) | **FAIL** *(not executed this session)* | Requires interactive FB grant + video |
| 16 | Privacy describes Page ID, name/photo, encrypted token, purpose, retention, deletion | **PASS** (source) / **PARTIAL** (live) | Source updated with `pages_show_list`, retention; **live** privacy still older copy until web rebuild (still has Page ID / AES / 72h) |
| 17 | EN reviewer guide + video checklist | **PASS** | `docs/meta-app-review/REVIEWER_INSTRUCTIONS_EN.md`, `VIDEO_CHECKLIST.md` |
| 18 | Unit/smoke suite for OAuth assert + FLB + pages util | **PASS** | assert, FLB, pages-util, fanpage-permissions |

---

## Production OAuth config (verified)

| Key | Value | Status |
|-----|-------|--------|
| META_APP_ID | `1045516051171576` | PASS |
| META_LOGIN_CONFIG_ID | `2006772376877449` | PASS |
| META_AUTO_POST_REDIRECT_URI | `https://marketingautoaz.com/api/v1/auto-post/facebook/oauth/callback` | PASS |
| OAUTH_CONNECTION | `true` | PASS |
| AUTO_POST_OAUTH_CANARY | `true` (reviewer org allowlisted) | PASS for review |
| META_FACEBOOK_OAUTH_REDIRECT_URI | unset / not used for Auto Post | PASS |
| META_OAUTH_USE_SHARED_REDIRECT | `false` | PASS |

OAuth dialog URL (redacted): host `www.facebook.com`, `client_id` + `config_id` as above, `redirect_uri` production, **no** `scope=` query (scopes come from Login Configuration), `auth_type=rerequest`, state present.

---

## Reviewer account / paths

| Item | Value |
|------|--------|
| Email | `xuanluongmarketing@gmail.com` (from env; password private) |
| App login | https://marketingautoaz.com/login |
| Connect path | https://marketingautoaz.com/content?tab=channels |
| Integration doc | https://marketingautoaz.com/facebook-integration |
| Role | OWNER |
| Subscription | ACTIVE, plan `msp-pro-6m`, ~1826 days remaining |

---

## Issues

### P0
- None confirmed for correctly configured production **API start** path.

### P1
1. **Interactive live Meta grant not verified in this audit** — blocks GO. Record `VIDEO_CHECKLIST.md` with a Facebook user that manages a real Fanpage.
2. **Privacy `pages_show_list` / retention wording is in source only** — live `/privacy` not rebuilt/redeployed (audit deliberately did not deploy). Redeploy web after review so Meta crawlers see the updated copy.
3. **`pageTokenAllowsManagePosts` soft-accept** — may accept page save when user scopes include `pages_show_list` without hard `debug_token` proof of `pages_manage_posts` (`auto-post-facebook.service.ts` ~1451–1467). Acceptable for **listing** review; tighten before relying on publish-only enforcement.
4. *(Resolved in this branch)* Assert test expected throw on seoauto legacy relay; production correctly **warns only**. Test aligned in `scripts/test-assert-auto-post-meta-oauth.ts`.

### P2
1. Status API may still list page rows while `connected: false` (stale UI semantics) — confirm UX copy for reviewers.
2. Canary still on (`AUTO_POST_OAUTH_CANARY=true`) — fine for App Review; open to all tenants only after GO + smoke.

---

## Files changed in this audit (no unrelated dirty tree)

| File | Change |
|------|--------|
| `docs/meta-app-review/ROLLBACK.md` | Rollback instructions |
| `docs/meta-app-review/REVIEWER_INSTRUCTIONS_EN.md` | EN reviewer guide |
| `docs/meta-app-review/VIDEO_CHECKLIST.md` | Video shot list |
| `docs/meta-app-review/REPORT.md` | This report |
| `docs/meta-app-review/evidence/*.html` | Public page HTML snapshots |
| `scripts/test-assert-auto-post-meta-oauth.ts` | Align with warn-only legacy relay |
| `scripts/audit-oauth-start-params.cjs` | Redacted OAuth start audit |
| `apps/web/src/app/privacy/page.tsx` | Explicit Page fields, `pages_show_list`, retention |

---

## Evidence / screenshots

- HTML snapshots: `docs/meta-app-review/evidence/{privacy,terms,facebook-data-deletion,facebook-integration}.html`
- curl HTTPS 200 proofs captured in this report
- Smoke logs: `meta-reviewer:smoke` ALL_PASS; OAuth param audit JSON `all_pass: true`
- Browser console/network for full connect: **deferred to video recording** (interactive Meta)

---

## Smoke commands re-run

```bash
pnpm meta-reviewer:smoke
pnpm test:assert-auto-post-meta-oauth
pnpm test:auto-post-facebook-login-for-business
pnpm test:auto-post-meta-pages-util
pnpm test:fanpage-permissions
node scripts/with-root-env.cjs node scripts/audit-oauth-start-params.cjs
node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/check-oauth-start-scopes.ts
```

---

## Rollback

```bash
cd /var/www/marketingaut_usr/data/www/marketingautoaz.com
git checkout audit/meta-app-review-pages-show-list-rollback
# or hard reset ONLY if you intentionally discard this audit branch work:
# git reset --hard audit/meta-app-review-pages-show-list-rollback
```

Tag SHA: `d31862b4aeee7a52c35d3fbef72e4c118e5c4897`

---

## Path to GO

1. Rebuild/redeploy **web only** so `/privacy` serves the updated `pages_show_list` / retention copy (ops window).
2. Record video per `VIDEO_CHECKLIST.md` through **Đã kết nối** + disconnect with real Meta Pages.
3. Re-confirm `audit-oauth-start-params.cjs` still PASS after any Meta Dashboard change.
4. Then flip verdict to **GO**.

---

## Final conclusion

# **NO-GO**

Infrastructure, public links, reviewer account, Configuration ID / redirect / App ID, and OAuth start are ready. Full live `pages_show_list` browser proof with real Meta Page data + live privacy redeploy remains outstanding.
