# Meta App Review — Reviewer Instructions (English)

**Product:** MarketingAutoAZ  
**Permission under review:** `pages_show_list`  
**App ID:** `1045516051171576`  
**Login Configuration ID:** `2006772376877449`  
**OAuth redirect:** `https://marketingautoaz.com/api/v1/auto-post/facebook/oauth/callback`

---

## Test account

| Field | Value |
|-------|--------|
| App URL | https://marketingautoaz.com |
| Login | https://marketingautoaz.com/login |
| Email | *(provided in Meta App Review notes / private channel — see env `META_REVIEWER_EMAIL`)* |
| Password | *(provided privately — never commit)* |
| Role | Customer **OWNER** (not platform admin) |
| Gates | No SMS OTP, no payment wall, active subscription (≥90 days), OAuth canary allowlisted |

Public docs for this integration:  
https://marketingautoaz.com/facebook-integration

---

## What `pages_show_list` is used for

After Facebook Login for Business, MarketingAutoAZ calls Meta Graph `/me/accounts` to list Fanpages the signed-in Facebook user **manages**. The reviewer then **selects** which Pages to save for Auto Post. We do **not** auto-connect unselected Pages, scrape public Pages, or attach Pages the user does not manage.

Related scopes on the same Login Configuration (for publishing after connect): `pages_read_engagement`, `pages_manage_posts`.

---

## Step-by-step test path

1. Open https://marketingautoaz.com/login and sign in with the reviewer account.
2. Go to **Content** (Content Marketing / Content Studio).
3. Open **Kết nối kênh** / Connect channels — URL:  
   https://marketingautoaz.com/content?tab=channels
4. Click **Kết nối Facebook** / Connect Facebook.
5. Complete **Facebook Login for Business** in the Facebook dialog.
6. Grant `pages_show_list` (and related Page permissions shown by Meta).
7. After redirect back to MarketingAutoAZ, the UI lists **real managed Pages** from Meta (name + avatar).
8. Select one or more Pages → **Save**.
9. Confirm each selected Page shows **Đã kết nối** (Connected).
10. Click **Ngắt kết nối** on a single Page and confirm it disconnects without removing other Pages.

---

## Public policy links (no login required)

| Page | URL |
|------|-----|
| Privacy Policy | https://marketingautoaz.com/privacy |
| Terms of Service | https://marketingautoaz.com/terms |
| Facebook data deletion | https://marketingautoaz.com/facebook/data-deletion |
| Facebook integration (EN) | https://marketingautoaz.com/facebook-integration |

---

## Expected success criteria

- OAuth uses App ID `1045516051171576` and Configuration ID `2006772376877449`.
- Callback host is `marketingautoaz.com` (HTTPS) — not localhost / seoauto.
- Page list comes from live Meta `/me/accounts` after grant (not hardcoded mocks).
- Only Pages the Facebook user manages appear.
- Unselected Pages are **not** saved.
- Disconnect works per Page.
- Tokens are never shown in the browser URL or UI.

---

## If something fails

| Symptom | What to try |
|---------|-------------|
| No Pages listed | Use a Facebook user that **manages** at least one Fanpage as Admin. |
| Permission / scope error | Reconnect and accept all Page permissions in the Facebook dialog. |
| Token expired / needs reconnect | Click Connect Facebook again (`auth_type=rerequest`). |
| Callback error | Confirm Meta Valid OAuth Redirect URIs includes the production callback above. |

Contact: thegioimarketingdigi@gmail.com
