# Deployment guide — Permanent shareable URL

Deploys AmbuMap to:
- **Backend (Flask + Postgres + PostGIS):** [Render.com](https://render.com) — free tier
- **Frontend (React/Vite):** [Vercel.com](https://vercel.com) — free tier
- **Result:** a permanent `https://YOUR-PROJECT.vercel.app` URL anyone can open

Total time: **~30 minutes** the first time, < 2 minutes for subsequent deploys (auto-deploy on git push).

---

## Prerequisites

- A GitHub account
- A free Render account (sign up with GitHub)
- A free Vercel account (sign up with GitHub)
- Git installed locally (`git --version` should work)

---

## Step 1 — Push the code to GitHub

If your project isn't already a git repo:

```bash
cd ~/DDP_REPORT/ambulance-mapping
git init
git add .
git commit -m "Initial commit"
```

Create a new **empty** repo on GitHub (no README, no .gitignore — leave it blank). Then:

```bash
git remote add origin https://github.com/YOUR-USERNAME/ambumap.git
git branch -M main
git push -u origin main
```

Replace `YOUR-USERNAME/ambumap` with your actual repo path.

Verify on GitHub that all files are there, especially:
- `backend/` (with `app.py`, `requirements.txt`, `Procfile`, `render.yaml`, `data/`)
- `frontend/` (with `package.json`, `src/`, `vercel.json`)

---

## Step 2 — Deploy the backend + database to Render

### 2a. Provision via Blueprint (the easy way)

1. Log in to https://dashboard.render.com
2. Click **New +** → **Blueprint**
3. Connect your GitHub account if prompted, then select your `ambumap` repo
4. Render will detect `backend/render.yaml` and show you a preview:
   - **Web Service:** `ambumap-backend` (Python, free)
   - **PostgreSQL Database:** `ambumap-postgres` (free, 90-day trial)
5. Click **Apply**
6. Wait ~3-5 minutes for the build and deploy

When complete, Render gives you a URL like `https://ambumap-backend.onrender.com`. **Copy this URL — you'll need it for the frontend.**

### 2b. Enable PostGIS extension (one-time)

The free Postgres comes with PostGIS available but not enabled. Enable it via the Render Shell:

1. In Render dashboard, open the `ambumap-postgres` database
2. Click the **Shell** tab on the left
3. Paste and run:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
SELECT PostGIS_Version();
```

You should see a version string like `3.4 USE_GEOS=1 USE_PROJ=1 USE_STATS=1`.

### 2c. Seed the database

Still in Render, open the `ambumap-backend` web service:

1. Click the **Shell** tab
2. Run:

```bash
python3 seed.py
```

Expected output:
```
✓ Schema initialised
⚠ data/haryana_districts.geojson not found (optional)
✓ Seeded 142 ambulances
✓ Seeded 699 hospitals (144 duplicate rows merged)
All done.
```

### 2d. Verify the backend is live

In your local terminal:

```bash
curl https://YOUR-BACKEND.onrender.com/api/health
# → {"status":"ok"}

curl https://YOUR-BACKEND.onrender.com/api/ambulances | python3 -c "import sys,json; print(len(json.load(sys.stdin)['features']))"
# → 142
```

If the first request is slow (~30-60s), that's Render's free tier waking up the service. Subsequent requests are fast.

---

## Step 3 — Deploy the frontend to Vercel

### 3a. Import the repo

1. Log in to https://vercel.com
2. Click **Add New** → **Project**
3. Import your `ambumap` GitHub repo
4. In the **Configure Project** screen:
   - **Framework Preset:** Vite (auto-detected)
   - **Root Directory:** click "Edit" and select `frontend`
   - **Build Command:** `npm run build` (default)
   - **Output Directory:** `dist` (default)
5. Expand **Environment Variables** and add:
   - **Key:** `VITE_API_BASE`
   - **Value:** `https://YOUR-BACKEND.onrender.com` (from Step 2)
6. Click **Deploy**

Wait ~1-2 minutes. Vercel gives you a URL like `https://ambumap.vercel.app`.

### 3b. Test the live frontend

Open the Vercel URL in your browser. You should see the full map with all 142 ambulances and 699 hospitals.

**This is the URL you share with your supervisor.**

---

## Step 4 — Lock down CORS (optional, security best practice)

Right now `CORS_ORIGINS` is set to `*` (any origin can call your API). Tighten it:

1. Render dashboard → `ambumap-backend` → **Environment**
2. Edit `CORS_ORIGINS` and set it to your Vercel URL:
   ```
   https://ambumap.vercel.app,https://ambumap-YOUR-USERNAME.vercel.app
   ```
3. Save — Render will redeploy automatically (~1 min)

---

## Step 5 — Subsequent updates

Once everything is wired:

```bash
# Make changes locally, then:
git add .
git commit -m "Whatever changed"
git push
```

- **Render** auto-redeploys the backend in ~2 min
- **Vercel** auto-redeploys the frontend in ~1 min

No manual steps. Your live URLs update automatically.

---

## Known free-tier limits

| Concern | What happens | Workaround |
|---|---|---|
| Render web service sleeps after 15min idle | First request after sleep takes 30-60s | Upgrade to Starter ($7/mo) for always-on |
| Render free Postgres expires after 90 days | Database is deleted | Migrate to Supabase free tier (also has PostGIS) or pay $7/mo |
| Vercel hobby tier bandwidth: 100 GB/mo | Plenty for a supervisor demo | Pro tier if app gets serious traffic |
| Public OSRM rate limits | Some routing requests may fail under load | Self-host OSRM on a VPS (see main README) |

For a supervisor demo over a few weeks, **free tier is enough**.

---

## If something breaks

**Backend won't start on Render:**
- Check the **Logs** tab in Render — usually a missing dependency or environment variable
- Confirm `DATABASE_URL` is set automatically by the Blueprint

**Frontend loads but shows no data:**
- Open browser DevTools → Console
- If you see CORS errors: backend `CORS_ORIGINS` doesn't include your Vercel URL
- If you see 404s on `/api/...`: `VITE_API_BASE` env var on Vercel is wrong or missing — re-check Step 3a, then trigger a redeploy from Vercel dashboard (Deployments → ... → Redeploy)

**Postgres errors about missing `postgis`:**
- You skipped Step 2b — go enable the extension

**Render says "Database does not exist":**
- Render's free Postgres might have expired — check the Database tab. If so, provision a new one and re-seed.

---

## Quick reference

```
GitHub repo:       https://github.com/YOUR-USERNAME/ambumap
Backend (Render):  https://ambumap-backend.onrender.com
Database (Render): managed Postgres + PostGIS
Frontend (Vercel): https://ambumap.vercel.app   ← share this
```
