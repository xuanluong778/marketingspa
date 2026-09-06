# Prompt 3B — App Review Readiness Report

Generated after web EN deploy to production (`2026-09-02`).

## Deploy

| Item | Status |
|------|--------|
| Web build (release) | Done — `apps/web/.next` rebuilt |
| PM2 `web` restart | Done — port 3002 |
| Prod chunk `5064-eda716382c7352b3.js` | Served on https://marketingautoaz.com |

## Live EN verification

| Test | Result |
|------|--------|
| `ENGLISH_REVIEW_FLOW_LIVE` | **PASS** |
| `NO_SYSTEM_USER_CONFUSION_LIVE` | **PASS** |
| `NO_VI_HARDCODE_LIVE` | **PASS** (EN at runtime via `?lang=en`; VI strings remain in bundle for `locale=vi`) |
| `PROMPT_3B_EN_DEPLOY_LIVE` | **PASS** |

Reviewer URL: https://marketingautoaz.com/content?tab=channels&lang=en

---

## Final verdicts

| Key | Value |
|-----|-------|
| `PROMPT_3B_FINAL` | **FAIL** (live proof incomplete) |
| `FANPAGE_CODE_UI_READY` | **PASS** |
| `FANPAGE_REVIEW_READY` | **PENDING_LIVE_RECONNECT** |
| `MESSENGER_REVIEW_READY` | **BLOCKED_META_CONFIG** |
| `ADS_CODE_UI_READY` | **PASS** |
| `ADS_REVIEW_READY` | **PENDING_LIVE_PROOF** |
| `ADS_READ_LIVE` | **FAIL** |
| `ADS_MANAGEMENT_LIVE` | **FAIL** |
| `BUSINESS_MANAGEMENT` | **DEFERRED_NOT_REQUESTED** |
| `FACEBOOK_APP_REVIEW_READY` | **FAIL** |

---

## Area matrix

| AREA | CURRENT_STATUS | LIVE_EVIDENCE | BLOCKER | ACTION | FINAL_STATUS |
|------|----------------|---------------|---------|--------|--------------|
| Web EN UI | Deployed | Prod JS chunk has EN phrases; no System User | — | Use `?lang=en` in all review videos | **PASS** |
| Fanpage OAuth | Code PASS | Reviewer not connected; `missingRequired` all 3 scopes | No browser reconnect yet | OAuth at `/content?tab=channels&lang=en` → select Page | **PENDING_LIVE_RECONNECT** |
| pages_read_engagement | Code hard-fail | No connected Page to sync | Same as Fanpage | Reconnect → Sync → View Details | **PENDING** |
| pages_manage_posts | Code PASS | Publish test blocked | No connected Page | Reconnect → publish test post → verify on Facebook | **PENDING** |
| Messenger | Code PASS | No Login Config | `META_MESSENGER_LOGIN_CONFIG_ID` unset | See Messenger manual actions below | **BLOCKED_META_CONFIG** |
| Meta Ads | Code/UI PASS | No Ad Account connected | No live OAuth + account pick | Connect Ads → real Ad Account → pause/resume test | **PENDING_LIVE_PROOF** |
| business_management | Deferred | N/A | No production feature | Do not submit permission or video | **DEFERRED_NOT_REQUESTED** |

---

## Fanpage live gates (after reconnect)

Run: `pnpm test:facebook-prompt2-app-review`

Current (no connected Page):

| Gate | Status |
|------|--------|
| `PAGES_SHOW_LIST` | Pending reconnect |
| `PAGE_PICKER` | Pending reconnect |
| `PAGE_SELECT` | Pending reconnect |
| `PAGES_READ_ENGAGEMENT` | **FAIL** |
| `PAGE_SYNC` | **FAIL** |
| `PAGES_MANAGE_POSTS` | **FAIL** |
| `PUBLISH_POST` | **FAIL** |
| `POST_VISIBLE_ON_FACEBOOK` | **FAIL** |
| `PROMPT_2_FINAL` | **FAIL** |

---

## OAuth 3A (unchanged)

| Gate | Status |
|------|--------|
| `FANPAGE_OAUTH_LIVE` | **PASS** |
| `MESSENGER_OAUTH_LIVE` | **BLOCKED** |
| `ADS_OAUTH_LIVE` | **PASS** |
| `PROMPT_3A_FINAL` | **PASS** |

---

## Video plan — submit only

1. `pages_show_list`
2. `pages_read_engagement`
3. `pages_manage_posts`
4. `pages_messaging` — **after** Messenger unblocked
5. `pages_manage_metadata` — **after** webhook live
6. `ads_read`
7. `ads_management`

**Not submitting:** `business_management`

---

## Messenger manual actions (Meta Dashboard)

1. **App Dashboard → Facebook Login for Business → Configurations → Create**
   - Name: e.g. `MarketingAutoAZ Messenger`
   - Permissions: `pages_show_list`, `pages_messaging`, `pages_manage_metadata`
2. **Valid OAuth redirect URI:**  
   `https://marketingautoaz.com/api/v1/messaging/facebook/oauth/callback`
3. **Server env:**  
   `META_MESSENGER_LOGIN_CONFIG_ID=<new_config_id>`
4. **Restart API** (PM2) after env change
5. **Browser test:** Chatbot CSKH → Connect Facebook Page → OAuth grant
6. **Webhook:** Page subscribe → send test Messenger → receive in app → reply

---

## Commands

```bash
pnpm test:facebook-app-review-live-en      # EN deploy live
pnpm test:facebook-app-review-audit        # 3B verdicts
pnpm test:facebook-oauth-flows-audit       # 3A OAuth
pnpm test:facebook-prompt2-app-review      # Fanpage live (after reconnect)
```
