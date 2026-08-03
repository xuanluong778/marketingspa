# App Review video checklist — `pages_show_list`

Record **one continuous screen recording** (desktop, 1080p+, clear audio optional). Prefer English UI narration or on-screen captions.

## Before recording

- [ ] Incognito/private window (or logged out of MarketingAutoAZ).
- [ ] Facebook account that **manages ≥1 real Fanpage**.
- [ ] Reviewer credentials ready.
- [ ] Browser zoom 100%; show full URL bar.

## Shot list (in order)

| # | Shot | Must show |
|---|------|-----------|
| 1 | Open https://marketingautoaz.com/privacy | HTTPS lock, page loads **without login** |
| 2 | Open https://marketingautoaz.com/terms | HTTPS, no login wall |
| 3 | Open https://marketingautoaz.com/facebook/data-deletion | HTTPS, deletion instructions |
| 4 | Open https://marketingautoaz.com/facebook-integration | Mentions `pages_show_list`, App ID, Config ID |
| 5 | Go to /login → sign in with reviewer account | No OTP / payment / trial block |
| 6 | Navigate Content → **Kết nối kênh** (`/content?tab=channels`) | Channels panel visible |
| 7 | Click **Kết nối Facebook** | Redirect to Facebook Login for Business |
| 8 | Facebook dialog | App name MarketingAutoAZ; grant Page permissions including list Pages |
| 9 | Return to app | URL on marketingautoaz.com; no access token in URL |
| 10 | Page picker | **Real** Page name(s) + avatar from Meta (not placeholders) |
| 11 | Select Page(s) → Save | Save succeeds |
| 12 | Connected state | Selected Page shows **Đã kết nối** |
| 13 | Disconnect one Page | Status updates; other Pages (if any) remain |
| 14 | (Optional) Mobile viewport or phone | Same connect path still usable |

## Do **not** do in the video

- Do not paste Page access tokens.
- Do not use localhost or staging domains.
- Do not show `.env`, secrets, or admin/platform screens.
- Do not skip the Facebook permission dialog.

## After recording

- [ ] Upload video to Meta App Review submission.
- [ ] Paste reviewer email/password in the private App Review notes only.
- [ ] Link public docs: privacy, terms, data-deletion, facebook-integration.
