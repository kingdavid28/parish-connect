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
        └── cron-job.org → /api/health keep-alive, /api/cron/autopost
            (daily announcements), /api/cron/contribution-reminder (BEC dues)
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
| `PARISH_SHORT_NAME` | `St. Raphael` (shown in the navbar on mobile) |
| `PARISH_LOCATION` | `Kawayan, Biliran` |
| `PARISH_TAGLINE` | e.g. `Faith. Community. Service.` |
| `PARISH_ACCENT_COLOR` | `#16a34a` (green — from the parish seal) |
| `PARISH_LOGO_URL` | `brands/san-raphael/logo.png` (frontend-hosted) or an absolute URL |
| `PARISH_BACKGROUND_URL` | `brands/san-raphael/background.jpg` (or any absolute URL) |
| `PARISH_HASHTAGS` | `#SaintRaphaelKawayan #ParishConnect` |
| `VAPID_*` | generate: `npx web-push generate-vapid-keys` |
| `MAIL_*` | Brevo SMTP credentials |
| `GCASH_NUMBER` / `GCASH_NAME` | `09173235981` / `REYCEL R. CENTINO` |
| `GCASH_QR_URL` | `${APP_URL}/brands/san-raphael/gcash-qr.jpg` |
| `R2_*` | from Step 4 |
| `CRON_SECRET` | long random string |
| `GROQ_API_KEY` | optional — AI autoposts (free at console.groq.com) |
| `GROQ_MODEL` | optional override — default `openai/gpt-oss-20b` (Groq retires models every few months) |

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

## Step 6 — Cron jobs (cron-job.org, free)

Three jobs, all on cron-job.org:

| Job | URL | Method | Schedule | Auth |
|---|---|---|---|---|
| Keep-alive | `/api/health` | GET | every 5 min | none |
| Parish autopost | `/api/cron/autopost` | POST | daily 07:00 | `x-cron-secret` header |
| BEC dues reminder | `/api/cron/contribution-reminder` | POST | monthly, 5th, 07:00 | `x-cron-secret` header |

Notes:

- **Keep-alive matters:** free Render sleeps after ~15 min idle and cold
  starts can outlast cron-job.org's 30s timeout — the sleeping instance's
  502 HTML page shows as "Failed (output too large)". The 5-min
  `/api/health` ping keeps the API warm for users *and* cron jobs.
- `x-cron-secret` header = `CRON_SECRET` (preferred over `?token=` so the
  secret stays out of URL access logs). Leave Request body empty.
- `autopost` writes a daily announcement post — Groq AI if `GROQ_API_KEY`
  is set, rotating fallback templates otherwise.
- `contribution-reminder` pushes to every **active donor linked to an app
  account** with no contribution recorded for the previous month
  (override with `?year=YYYY&month=M`).

The finance module is on by default; set `FEATURE_FINANCE=0` to hide it.

---

## Step 7 — Sacramental records

The new instance stores records **internally** (`sacramental_records` table) —
no external database needed.

1. **Digitize:** log in as superadmin → **Parish Records** → **Add Record**
   one at a time, or **Import CSV** for bulk entry (max 500 rows/import —
   download the in-app template; columns match the sacristan registry format:
   name, birthday, parents, baptismal details, confirmation details).
2. **Verification toggle:** while records are being digitized, set
   `VERIFY_PARISH_RECORDS=0` so parishioners can register without matching a
   record. Flip to `1` once the registry is populated — new signups must then
   match name + father's first name.
3. Admins see the full searchable registry; parishioners see only their own
   matching record.

To disable the feature entirely: `RECORDS_MODE=off`.

---

## Step 8 — BEC monthly dues ledger (admin)

Admin Management → **BEC Dues** tab (requires `admin`/`superadmin`):

1. Add **BECs** (Basic Ecclesial Communities) — e.g. "BEC St. Joseph".
2. Add **donors** — name + BEC + optional GCash number + optional linked
   app account. Linking enables push reminders via the Step 6 cron.
3. Click a donor's **Ledger** → click any month cell → record amount,
   method (cash/GCash/bank), reference no., optional receipt photo
   (stored in R2). Re-recording a month overwrites — one row per
   donor/month enforced by `UNIQUE(donor_id, year, month)`.
4. The top card shows collected/paid/unpaid totals per month, broken
   down per BEC. Deactivating a donor stops reminders, keeps the ledger.

Everything is audit-logged (`create_donor`, `record_contribution`, …).

---

## Environment variable reference

See `backend/.env.example` — every variable is commented. Never commit `.env`;
each parish's secrets live only on the host.

## Checklist — Saint Raphael Archangel Parish

- [x] CockroachDB cluster `raw-goblin-34935` (ap-southeast-1) + `defaultdb`
- [x] `npm run migrate` completed (26 tables incl. `becs`, `donors`, `contributions`)
- [x] Superadmin seeded (`kingAdmin`)
- [x] API live on Render; `/api/health` + `/api/config` verified
- [x] R2 bucket `parish-connect-sra-uploads` + API token; test upload verified
- [x] VAPID keys set on Render; reminder endpoint verified (push delivery
      pending first linked donor subscription)
- [x] Brevo SMTP verified — test email sent to `reycelrcentino@gmail.com`
- [x] Frontend on Pages; logo/color/name verified at boot
- [x] GCash details set (`09173235981` / REYCEL R. CENTINO)
- [ ] Registry imported (Parish Records → Import CSV)
- [ ] `VERIFY_PARISH_RECORDS` — currently `0`, flip to `1` after digitization
- [x] cron-job.org: keep-alive 5-min, autopost daily, dues reminder monthly — all verified 200

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
- [ ] Sacramental records digitization (Parish Records → Add Record or
      Import CSV for bulk), then flip `VERIFY_PARISH_RECORDS=1`
- [ ] Optional housekeeping: delete the test posts created by autopost
      test runs; delete `test/healthcheck.txt` in the R2 bucket


| Layer | URL / Status |
| --- | --- |
| Frontend | https://parish-connect-kawayan-biliran.pages.dev — SRA branding, green #16a34a, seal logo/icons, parish photo background |
| API | https://parish-connectkawayanbiliranapi.onrender.com — health 200 |
| Database | CockroachDB raw-goblin-34935 (Singapore) — 26 tables, migrated |
| Auth | kingAdmin / superadmin login verified cross-origin (Pages → Render, CORS header confirmed) |
| GCash | QR + 09173235981 / REYCEL R. CENTINO serving from the wallet endpoint |
| File storage | R2 `parish-connect-sra-uploads` — S3 API verified, public dev URL live |
| Email | Brevo SMTP — authenticated + test email sent |
| Push | Web Push/VAPID — `/api/cron/contribution-reminder` verified 200 |
| BEC dues ledger | `becs`/`donors`/`contributions` tables + `/api/finance` + Admin Management → "BEC Dues" tab |
| Cron | cron-job.org ×3 — keep-alive (5 min), autopost (daily, Groq AI confirmed), dues reminder (monthly) |
| Auto-deploys | Push to main → Render rebuilds API, Pages rebuilds frontend |