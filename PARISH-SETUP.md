# Parish Setup Guide — Deploying Parish Connect for a New Parish

This runbook walks through deploying a **separate Parish Connect instance** for a
new parish — e.g. **Saint Raphael Archangel Parish, Kawayan, Biliran** — with its
own database, API, storage bucket, and branding. All services below have free
tiers sufficient to launch.

Each parish is a fully independent deployment. There is no shared database —
scaling to more parishes means repeating this guide with different env values.

---

## Architecture

```
React SPA (Cloudflare Pages)
        │  fetch() → API
        ▼
Node.js / Express API (Render, Railway, or any Node host)
        │
        ├── CockroachDB Serverless (PostgreSQL wire protocol)
        ├── Cloudflare R2 (image uploads: posts, avatars, receipts)
        ├── Web Push (VAPID) + SMTP email (Brevo)
        └── cron-job.org → POST /api/cron/autopost (daily announcements)
```

The original San Vicente Ferrer deployment (PHP + MySQL on Hostinger) is
unaffected — this guide is for the **new Node.js backend** in `backend/`.

---

## Step 0 — Prerequisites

- GitHub account with this repo pushed
- Accounts (all free): **CockroachDB Cloud**, **Render** (or equivalent),
  **Cloudflare**, **Brevo** (SMTP), **cron-job.org**, **Groq** (optional, AI autoposts)
- Node.js 18+ locally for running scripts
- From the parish: official **logo image**, preferred **accent color**,
  **GCash number/name/QR** (if wallet enabled), a **contact email**

---

## Step 1 — Database (CockroachDB Serverless)

1. Cloud dashboard → **Create Cluster** → Serverless → pick a region near the
   Philippines (e.g. `asia-southeast1`).
2. Create a **SQL user** and a database named e.g. `parish_connect`.
3. Copy the connection string:

   ```
   postgresql://USER:PASSWORD@HOST:26257/parish_connect?sslmode=verify-full
   ```

4. Apply the schema (locally or via Render shell):

   ```bash
   cd backend
   cp .env.example .env          # fill in DATABASE_URL
   npm install
   npm run migrate               # runs src/db/schema.pg.sql
   ```

5. Seed the first superadmin:

   ```bash
   SEED_ADMIN_EMAIL=admin@sra-kawayan.ph \
   SEED_ADMIN_PASSWORD='a-strong-password' \
   npm run seed-admin
   ```

   Or pass `--email/--password/--name` flags. Change this password after first login.

---

## Step 2 — API deployment (Render free tier)

1. Render → **New → Web Service** → connect the repo.
2. Settings:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
3. Add environment variables (see full list in `backend/.env.example`):

| Variable | Saint Raphael value |
|---|---|
| `DATABASE_URL` | from Step 1 |
| `APP_URL` | `https://sra-kawayan.pages.dev` (your Pages URL) |
| `APP_BASE_PATH` | *(empty — root deploy)* |
| `ALLOWED_ORIGINS` | `https://sra-kawayan.pages.dev` (+ `http://localhost:5173` for dev) |
| `JWT_SECRET` | `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `PARISH_ID` | `saint-raphael-kawayan` |
| `PARISH_NAME` | `Saint Raphael Archangel Parish` |
| `PARISH_SHORT_NAME` | `Saint Raphael Parish` |
| `PARISH_LOCATION` | `Kawayan, Biliran` |
| `PARISH_TAGLINE` | e.g. `Faith. Community. Service.` |
| `PARISH_ACCENT_COLOR` | `#16a34a` (green — from the parish seal) |
| `PARISH_LOGO_URL` | `brands/san-raphael/logo.png` (frontend-hosted) or an absolute URL |
| `PARISH_BACKGROUND_URL` | optional background image URL |
| `PARISH_HASHTAGS` | `#SaintRaphaelKawayan #ParishConnect` |
| `VAPID_*` | generate: `npx web-push generate-vapid-keys` |
| `MAIL_*` | Brevo SMTP credentials |
| `GCASH_NUMBER` / `GCASH_NAME` | **pending** — QR masks the number; get from parish |
| `GCASH_QR_URL` | `${APP_URL}/brands/san-raphael/gcash-qr.jpg` |
| `R2_*` | from Step 4 |
| `CRON_SECRET` | long random string |
| `GROQ_API_KEY` | optional |

4. Deploy. Verify: `GET https://your-api.onrender.com/api/health` returns
   `{"success":true}` and `GET /api/config` returns the parish branding JSON.

> **Free-tier note:** Render sleeps after ~15 min idle → first request is slow.
> A cron-job.org ping of `/api/health` every 10 min mitigates this.

---

## Step 3 — Frontend (Cloudflare Pages)

1. Cloudflare → **Pages → Create → Connect to Git**.
2. Build settings:
   - **Framework:** Vite
   - **Build command:** `npm run build:san-raphael`
   - **Output dir:** `dist`
3. Environment variables for the build:

| Variable | Value |
|---|---|
| `VITE_API_BASE_URL` | `https://your-api.onrender.com/api` |

`VITE_API_BASE_URL` is the only secret-ish value — everything else (parish
name, accent `#16a34a`, logo, base path) lives in the committed
`.env.san-raphael` profile, loaded automatically by `--mode san-raphael`.

4. Deploy. The build emits `manifest.json` (name, icons, theme color) and
   rewrites `index.html` branding from the same env vars; at runtime the app
   fetches `/api/config` and applies any overrides.

**Subfolder hosting instead?** (e.g. `parish.example.com/app/`): set
`VITE_BASE_PATH=/app` in the env profile — Router basename, service-worker
scope, manifest URLs, and asset paths all follow automatically.

### Parish assets convention

Each parish's static files live in `public/brands/<parish-id>/`:

```
public/brands/san-raphael/
  logo.jpg        ← source image (as supplied by the parish)
  logo.png        ← favicon / apple-touch (generated)
  icon-192.png    ← PWA icon (generated)
  icon-512.png    ← PWA icon (generated)
  gcash-qr.jpg    ← GCash payee QR (served via GCASH_QR_URL)
```

After dropping in a new logo, regenerate the PNGs (stock Windows, no deps):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/prepare-parish-assets.ps1 `
  -BrandDir "public\brands\<parish-id>" -Source "logo.jpg"
```

Then create `.env.<parish-id>` (copy `.env.san-raphael` as the template) and
add a `build:<parish-id>` script to `package.json`.

---

## Step 4 — Cloudflare R2 (image uploads)

1. R2 → **Create bucket** `parish-connect-sra-uploads`.
2. Enable a **public URL** (`r2.dev` subdomain or a custom domain) — uploaded
   images must be reachable by the app.
3. **Manage R2 API Tokens** → create token with read/write on that bucket.
4. Set in the API env: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`.

If R2 is not configured, the API accepts uploads but stores nothing — avatar/
post images will 500, so configure it before launch.

---

## Step 5 — Email (Brevo) & Push (VAPID)

**Brevo (300 emails/day free):**
1. brevo.com → SMTP & API → copy SMTP credentials.
2. `MAIL_HOST=smtp-relay.brevo.com`, `MAIL_PORT=587`, `MAIL_USERNAME/PASSWORD`.
3. `MAIL_FROM_ADDRESS` must be a **verified sender** in Brevo.
4. Used for welcome + password-reset emails. If unset, email is skipped
   gracefully (tokens still work, just not delivered).

**Web Push:**
```bash
npx web-push generate-vapid-keys
```
Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL=mailto:...`.
The public key is exposed to the frontend via `GET /api/config` — that's fine.

---

## Step 6 — Auto-post cron (optional)

The API exposes `POST /api/cron/autopost` (creates a daily announcement post
from Groq AI or built-in templates).

On cron-job.org:
- URL: `https://your-api.onrender.com/api/cron/autopost`
- Method: **POST**, header `x-cron-secret: <CRON_SECRET>`
- Schedule: daily, e.g. 07:00 Asia/Manila

---

## Step 7 — Sacramental records

The new instance stores records **internally** (`sacramental_records` table) —
no external database needed.

1. **Digitize:** log in as superadmin → **Parish Records** → **Add Record**
   (or bulk-load via SQL inserts into `sacramental_records` — columns match the
   old sacristan registry format: name, birthday, parents, baptismal details,
   confirmation details).
2. **Verification toggle:** while records are being digitized, set
   `VERIFY_PARISH_RECORDS=0` so parishioners can register without matching a
   record. Flip to `1` once the registry is populated — new signups must then
   match name + father's first name.
3. Admins see the full searchable registry; parishioners see only their own
   matching record.

To disable the feature entirely: `RECORDS_MODE=off`.

---

## Environment variable reference

See `backend/.env.example` — every variable is commented. Never commit `.env`;
each parish's secrets live only on the host.

## Checklist — Saint Raphael Archangel Parish

- [ ] CockroachDB cluster `sra-kawayan` + `parish_connect` DB created
- [ ] `npm run migrate` completed (20+ tables)
- [ ] Superadmin seeded; password changed after first login
- [ ] API live on Render; `/api/health` + `/api/config` verified
- [ ] R2 bucket + API token configured; test image upload works
- [ ] VAPID keys generated; push subscription works in browser
- [ ] Brevo SMTP verified; password-reset email received
- [ ] Frontend on Pages; correct logo/color/name visible at boot
- [ ] GCash details set (if wallet on)
- [ ] `VERIFY_PARISH_RECORDS` — start `0`, flip to `1` after digitization
- [ ] cron-job.org hitting `/api/cron/autopost` daily (optional)

## Onboarding the *next* parish

Repeat Steps 1–7 with new `PARISH_*`, `DATABASE_URL`, `APP_URL`, R2 bucket,
and GCash values. No code changes needed — branding comes from `/api/config`.

## Pre-flight status — Saint Raphael (what's done vs. what needs you)

**Already done (no credentials needed):**
- [x] Parish assets in `public/brands/san-raphael/` (logo, PNG icons, GCash QR)
- [x] Frontend build profile `.env.san-raphael` + `npm run build:san-raphael`
- [x] `backend/.env` rewritten in new format with **generated** `JWT_SECRET`,
      `CRON_SECRET`, and VAPID key pair; SRA branding pre-filled
- [x] `backend/.env.san-raphael` committed — copy-paste reference for the
      Render dashboard (secrets marked `<generated>`/`<TODO>`)
- [x] Backend smoke test passes — `/api/config` serves SRA branding,
      `/api/health` degrades gracefully without DB
- [x] `npm audit` — critical `proxy-addr` + 6 others fixed; nodemailer
      upgraded to v10 (14 advisories cleared). Remaining: `braces` (dev-only
      via nodemon, never ships) + moderate `qs` (transitive via Express —
      would need Express 5, low practical risk)

**Still needs you:**
- [x] CockroachDB Cloud account + cluster created (`raw-goblin-34935`, ap-southeast-1)
- [x] `DATABASE_URL` set → `npm run migrate` applied all 23 tables to `defaultdb`
- [x] Superadmin seeded (`reycelrcentino@gmail.com` / `kingAdmin`) — verified via live login → JWT
- [x] GCash payee set (`09173235981` / REYCEL R. CENTINO) + QR asset hosted
- [x] API deployed on Render (Singapore) — `https://parish-connectkawayanbiliranapi.onrender.com`, health 200, prod login verified
- [x] Frontend live on Cloudflare Pages — `https://parish-connect-kawayan-biliran.pages.dev`,
      `VITE_API_BASE_URL` set, `APP_URL`/`ALLOWED_ORIGINS` updated on Render,
      CORS + login verified cross-origin
- [ ] Remaining accounts: Cloudflare R2 (uploads), Brevo (SMTP), cron-job.org (optional: Groq)
- [ ] Sacramental records digitization (Parish Records → Add Record),
      then flip `VERIFY_PARISH_RECORDS=1`
