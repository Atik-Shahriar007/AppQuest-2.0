# NutriScan app

Expo app + Node API (Express, tRPC) + Supabase Postgres. Implementation Plan v2.

## Run locally

```bash
pnpm install
cp .env.example .env            # then fill in what you have
docker run -d --name nutriscan-pg -e POSTGRES_PASSWORD=nutriscan -e POSTGRES_DB=nutriscan \
  -p 127.0.0.1:54329:5432 postgres:16-alpine
pnpm db:migrate                 # create tables (RLS on)
pnpm ingest                     # rebuild the catalog from ../NutriScan-Product-Database
pnpm dev                        # API on :3000 + Expo on :8081
```

## Tests

```bash
pnpm test                                    # scoring + catalog
TEST_DATABASE_URL=postgres://postgres:nutriscan@127.0.0.1:54329/nutriscan_test pnpm test   # + AppLink/DB flows
```

## Where things are

| Path | What |
| --- | --- |
| `shared/nqss/` | NQSS v1.0 engine, approved estimation rules, Halal/Child labels. Pure TS, used by the app, API, USSD and OCR preview |
| `shared/catalog/` | Product builder and the generated `catalog.snapshot.json` (do not edit by hand) |
| `scripts/ingest.ts` | Reads the product database, copies images, writes the snapshot and `data/validation-report.md` |
| `data/catalog-overrides.json` | Team corrections by barcode (become `corrected` values) |
| `server/premium/` | Trial, passes, entitlements, CaaS charge ledger, subscription |
| `server/applink/` | AppLink client (from the official skill template), callbacks, USSD |
| `server/ai/` | OpenRouter: Nouri tool loop, label OCR, cost tracking and monthly cap |
| `server/alerts.ts` | Verified recall alerts: two-person approval, in-app, push, opt-in SMS |

## Rules that must not be broken

- Payments: access is granted only by AppLink's charging or subscription notification. `P1003` and a verified OTP grant nothing. Never start a second charge to retry one.
- AppLink credentials live only in the server environment. The API must run from a fixed outgoing IP registered with AppLink.
- The scoring engine owns every number. Nouri and OCR never compute or change a score.
- Estimated values carry `provenance: "estimated"` and the UI says "Estimated score".
- No real AppLink call is ever pointed at a local mock in production (the server refuses to boot).
