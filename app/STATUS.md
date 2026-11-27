# NutriScan status (27 Nov 2026)

Branch `v2-implementation`. Everything below runs locally; items marked **team** need an account,
approval or decision only the team can provide.

## Built and verified

| Area | State | How it was checked |
| --- | --- | --- |
| NQSS scoring (all 65 foods) | Done | Methodology worked examples (56, 76, 38.7) reproduced in tests |
| Data estimates and repairs | Done | Energy, free sugar, `0 g sugar` on sweet drinks, `0 mg sodium` with salt listed; all flagged in `data/validation-report.md` |
| Catalog in the app (67 products, images) | Done | Browser check, EN and BN |
| Halal / Child Safe / Better Alternatives | Done | Tests (12 halal products, caution items visible) |
| Sign-in (email) | Done | Real account signed in through the browser; token accepted by the API |
| Sign-in (Google) | Code done | **team**: enable the Google provider in Supabase |
| Profile, modes, history, favorites sync | Done | Rows appear in the database after sign-in |
| Nouri (free OpenRouter models) | Done | 30-question eval, see `data/nouri-eval-report.md` |
| Label OCR + review + score preview | Done | Unreadable photo correctly reported as unreadable |
| Compare (advanced part behind Premium/pass) | Done | Server gate tests |
| Premium: trial, subscription, passes | Done | Integration tests against an AppLink double + official validator |
| SMS alerts (opt-in), recalls, notifications | Done | Integration tests |
| USSD lookup | Done | Integration tests (ASCII, <=160 chars, session flow) |
| Contributions with photos, admin review, leaderboard | Done | Integration test |
| Expiry reminders (server + phone notification) | Done | Type-checked; phone notification needs a device test |
| Ingredient explainer | AI drafts for every catalog ingredient | **team**: review drafts, set `reviewed: true` |
| Reconciliation jobs | Done | Integration test |
| Deployment kit | Done | Docker image built and health-checked locally |

Tests: `pnpm test` (unit) and with `TEST_DATABASE_URL` set (integration), 62 passing.

## Team steps, in order

1. **AppLink today**: create the app at user.applink.com.bd, enable SMS, USSD, Subscription,
   OTP and CaaS; set the subscription to BDT 29 monthly; ask support for fast-track approval,
   callback source IPs, a USSD code and a shortcode. Questions to ask are in Plan v2 section 3.
2. **VPS with a fixed IP** and a domain; follow `deploy/README.md`. Register the VPS IP and the
   five callback URLs on the AppLink app; whitelist team numbers.
3. **Supabase**:
   - Database password -> `DATABASE_URL` for the VPS (the API currently uses a local Postgres).
   - Authentication -> Email: turn off "Confirm email" for the showcase, or add custom SMTP.
   - Authentication -> Providers -> Google: add a Google OAuth client (optional).
   - Add `nutriscan://auth-callback` and the web URL to the allowed redirect URLs.
4. **OpenRouter**: buy 10 USD of credits once (free models: 1000 requests/day instead of 50).
   Decide `OPENROUTER_DATA_COLLECTION` for production: `deny` (privacy, paid fallback answers)
   or `allow` (free models, users must be told messages may be stored).
5. **Content review**: ingredient drafts (`shared/catalog/ingredients.draft.json`) and the 30+
   flagged product records in `data/validation-report.md`.
6. **Submission (30 Nov)**: proposal PDF, demo video (show a real BDT 5 pass on a whitelisted
   number once AppLink approves; until then say clearly that payments are in test mode),
   GitHub link, declare the prototype and product database as pre-existing work.

## Known limits

- SMS alerts need a linked number, which today only comes from subscribing or buying a pass.
- 2- and 3-month plans are not offered (AppLink bills daily or monthly only).
- Push notifications to phones need an Expo/EAS project id; in-app notifications and
  on-device expiry reminders work without it.
- Free models are slower (5-30 s per Nouri answer) and rate-limited (20/min).
