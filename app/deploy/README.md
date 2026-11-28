# Deploying the NutriScan API

The API must run on a server with a **fixed outgoing IP address**: AppLink only accepts calls from
an IP registered on the app (otherwise `E1303`). A small VPS is enough (1 vCPU, 1 GB RAM).
Serverless platforms with rotating IPs will not work for AppLink.

## 1. One-time setup

1. Create the VPS (Ubuntu 24.04) and note its public IP. Check the outgoing IP from the VPS:
   `curl -4 https://api.ipify.org` - this is the IP to register with AppLink.
2. Point a domain at it, e.g. `api.nutriscan.example` (an A record to the VPS IP).
3. Install Docker: `curl -fsSL https://get.docker.com | sh`.
4. In Supabase: **Project Settings → Database → Connection string → URI** (Session pooler).
   This is `DATABASE_URL`. Keep it secret.

## 2. Configure

On your computer, in `app/`:

```bash
pnpm build:server              # writes deploy/dist (single-file bundle + migrations)
cp .env.example deploy/.env.production
```

Edit `deploy/.env.production` (never commit it):

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `PUBLIC_API_URL` | `https://api.nutriscan.example` |
| `DATABASE_URL` | Supabase connection string |
| `SUPABASE_URL` | `https://<project>.supabase.co` |
| `DEV_JWT_SECRET` | **leave empty** (the server refuses to start with it in production) |
| `OPENROUTER_API_KEY`, model lists, `AI_MONTHLY_BUDGET_USD` | as in development |
| `ADMIN_USER_IDS` | team members' Supabase user ids |
| `APPLINK_APP_ID`, `APPLINK_PASSWORD`, `APPLINK_*_URL` | from the AppLink dashboard, only the APIs enabled on the app |
| `APPLINK_CALLBACK_ALLOWED_IPS` | AppLink's callback source IPs (ask support@applink.com.bd) |
| `APPLINK_SMS_SHORTCODE`, `APPLINK_USSD_CODE` | once provisioned |

## 3. Run

Copy the `deploy/` folder to the VPS, then:

```bash
cd deploy
API_DOMAIN=api.nutriscan.example docker compose up -d --build
curl https://api.nutriscan.example/api/health
```

The container applies database migrations on every start, then starts the API. Caddy gets
an HTTPS certificate automatically.

## 4. AppLink provisioning

In the AppLink app settings, set these callback URLs (the API prints them at start-up):

| Callback | URL |
| --- | --- |
| Charging notification (CaaS) | `https://api.nutriscan.example/applink/caas/notify` |
| Subscription notification | `https://api.nutriscan.example/applink/subscription/notify` |
| SMS delivery report | `https://api.nutriscan.example/applink/sms/report` |
| SMS receive (MO) | `https://api.nutriscan.example/applink/sms/receive` |
| USSD receive | `https://api.nutriscan.example/applink/ussd/receive` |

Register the VPS outgoing IP from step 1 as the allowed host, and whitelist the team's
Banglalink numbers for Limited Production. Then check from the VPS:

```bash
docker compose exec api node -e "fetch(process.env.APPLINK_SUBSCRIPTION_QUERY_BASE_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({applicationId:process.env.APPLINK_APP_ID,password:process.env.APPLINK_PASSWORD})}).then(r=>r.json()).then(console.log)"
```

`statusCode: "S1000"` means credentials, IP and connectivity all work (Base Size charges nothing).

## 5. The app

Set in the app's environment before building:

```
EXPO_PUBLIC_API_URL=https://api.nutriscan.example
EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>
```

- **Web demo link for judges:** `pnpm build:web` writes `dist/`; host it on any static host
  (Netlify, Cloudflare Pages, GitHub Pages). Every product has its own page.
- **Android:** `npx eas build -p android --profile preview` (needs an Expo account) gives an APK.

## Updating

```bash
pnpm build:server && rsync -a deploy/ vps:~/deploy/ && ssh vps "cd deploy && docker compose up -d --build"
```
