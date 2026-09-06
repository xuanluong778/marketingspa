# Meta App Review — Video checklists by permission

Record **one continuous screen recording per permission** (1080p+, HTTPS, production domain `marketingautoaz.com`). Use English UI: add `?lang=en` to URLs or set browser language to English.

**Reviewer URL:** https://marketingautoaz.com/content?tab=channels&lang=en

---

## Permissions to submit (video plan)

| # | Permission | Submit now? |
|---|------------|-------------|
| 1 | `pages_show_list` | Yes |
| 2 | `pages_read_engagement` | Yes |
| 3 | `pages_manage_posts` | Yes |
| 4 | `pages_messaging` | When Messenger OAuth live |
| 5 | `pages_manage_metadata` | When webhook live |
| 6 | `ads_read` | Yes |
| 7 | `ads_management` | Yes |
| 8 | `business_management` | **No — DEFERRED_NOT_REQUESTED** |

Do **not** record or submit a video for `business_management` until Business Portfolio feature ships.

---

## 1. `pages_show_list` — Fanpage OAuth & Page picker

| Step | Must show |
|------|-----------|
| Login | https://marketingautoaz.com/login (reviewer account, no OTP wall) |
| Navigate | Content → Connect channels (`/content?tab=channels&lang=en`) |
| Connect | Click **Connect Facebook** → Facebook Login for Business |
| Grant | Meta dialog shows App **MarketingAutoAZ**; grant Page list permission |
| Return | Callback on `marketingautoaz.com` — **no token in URL** |
| List | **Select Facebook Pages to connect** — real Page names + avatars from Graph `/me/accounts` |
| Select | Check one or more Pages → **Connect selected Pages** |
| Connected | **Connected Facebook Page** badge on saved Page(s) |
| Disconnect | Disconnect one Page; others remain |

**Do not:** show `.env`, admin screens, localhost, or paste tokens.

---

## 2. `pages_read_engagement` — Sync & Page details

| Step | Must show |
|------|-----------|
| Prerequisite | At least one **Connected Facebook Page** (checklist #1) |
| Sync | Click **Sync Page from Facebook** on connected Page |
| Success | Last updated timestamp + live-from-Facebook message |
| Details | **View details** drawer — Page metadata (name, followers, cover) |
| Posts | **Posts from Facebook** section with real `published_posts` (or empty state) |
| Refresh | **Refresh from Facebook** re-fetches live Graph data |

**Must prove:** data comes from Graph API, not stale DB-only placeholders.

---

## 3. `pages_manage_posts` — Create & publish post

| Step | Must show |
|------|-----------|
| Prerequisite | Connected Page with publish permission |
| Create | Content Auto Post → create post → select connected Page |
| Publish | Publish / schedule → success in app |
| Verify | Open Facebook Page — **post appears on Meta** |

**If missing scope:** app shows clear error (not silent success).

---

## 4. `pages_messaging` — Receive & reply Messenger

| Step | Must show |
|------|-----------|
| Prerequisite | Messenger OAuth flow connected Page (separate Login Config when `META_MESSENGER_LOGIN_CONFIG_ID` set) |
| Send | From a Facebook user, send Messenger message to the Page |
| Receive | Message appears in MarketingAutoAZ inbox (Chatbot CSKH) |
| Reply | Agent reply sent → appears in Messenger thread |

**Note:** Advanced Access may be required for non-tester users.

---

## 5. `pages_manage_metadata` — Webhook subscribe

| Step | Must show |
|------|-----------|
| Connect | Connect Page via Messenger OAuth path |
| Subscribe | App subscribes Page webhook (`messages`, etc.) |
| Verify | Meta App Dashboard → Webhooks → Page subscriptions active |
| Live | Incoming webhook delivers message to app (see checklist #4) |

---

## 6. `ads_read` — Read campaigns & metrics

| Step | Must show |
|------|-----------|
| Navigate | Ads / AI Ads Manager → **Meta Ads** → Connect OAuth |
| Grant | `ads_read` (+ `ads_management` if shown) in Meta dialog |
| Account | Select Ad Account |
| Read | Campaign list + insights/metrics load from Graph |

---

## 7. `ads_management` — Create / edit ads

| Step | Must show |
|------|-----------|
| Prerequisite | Meta Ads connected with `ads_management` granted |
| Create | Create paused campaign/ad set/ad stack in app |
| Verify | Campaign visible in Meta Ads Manager |
| Edit | Pause / budget change (if UI exposes) → reflected on Meta |

**If `ads_management` declined:** write actions blocked; UI shows missing scope.

---

## 8. `business_management` — Business assets

| Step | Must show |
|------|-----------|
| Prerequisite | Production feature that reads Business Portfolio / Business assets |
| OAuth | Request `business_management` only when feature is live |
| Prove | User selects Business → app uses asset (not mock) |

**Current status (Prompt 3A):** `business_management` is **deferred** in Ads OAuth until a Business Portfolio UI exists. Do **not** submit this video until the feature ships.

---

## Public docs (no login)

| Page | URL |
|------|-----|
| Privacy | https://marketingautoaz.com/privacy |
| Terms | https://marketingautoaz.com/terms |
| Data deletion | https://marketingautoaz.com/facebook/data-deletion |
| Integration (EN) | https://marketingautoaz.com/facebook-integration |
